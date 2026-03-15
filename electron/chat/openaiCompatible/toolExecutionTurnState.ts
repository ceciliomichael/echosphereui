import path from 'node:path'
import type { Message } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from './toolTypes'
import {
  readOptionalBoolean,
  readOptionalBoundedPositiveInteger,
  readOptionalPositiveInteger,
  readRequiredString,
  resolveToolPath,
} from './tools/filesystemToolUtils'

type InspectionToolName = 'glob' | 'grep' | 'list' | 'read'

interface SuccessfulInspectionCall {
  key: string
  reuseHint: string
  targetPath: string
  toolName: InspectionToolName
}

export interface DuplicateInspectionCallError {
  details: Record<string, unknown>
  message: string
}

export interface ToolExecutionTurnState {
  inspectionCallsByKey: Map<string, SuccessfulInspectionCall>
}

const DEFAULT_DIRECTORY_ENTRY_LIMIT = 200
const DEFAULT_READ_LINE_COUNT = 500
const DEFAULT_SEARCH_RESULT_LIMIT = 200

function normalizeToolPath(input: string) {
  const normalizedPath = path.normalize(input).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}

function isSamePathOrDescendant(parentPath: string, candidatePath: string) {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`)
}

function readNormalizedAbsolutePath(argumentsValue: Record<string, unknown>, agentContextRootPath: string) {
  const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
  const { normalizedTargetPath } = resolveToolPath(agentContextRootPath, absolutePath)
  return normalizeToolPath(normalizedTargetPath)
}

function readNormalizedSubjectPath(subjectPath: string, agentContextRootPath: string) {
  if (subjectPath === '.') {
    return null
  }

  const absolutePath = path.isAbsolute(subjectPath) ? subjectPath : path.join(agentContextRootPath, subjectPath)
  const { normalizedTargetPath } = resolveToolPath(agentContextRootPath, absolutePath)
  return normalizeToolPath(normalizedTargetPath)
}

function buildInspectionCallKey(
  toolCall: OpenAICompatibleToolCall,
  argumentsValue: Record<string, unknown>,
  agentContextRootPath: string,
) {
  if (toolCall.name === 'list') {
    return JSON.stringify({
      absolutePath: readNormalizedAbsolutePath(argumentsValue, agentContextRootPath),
      limit: readOptionalPositiveInteger(argumentsValue, 'limit', DEFAULT_DIRECTORY_ENTRY_LIMIT),
      toolName: toolCall.name,
    })
  }

  if (toolCall.name === 'read') {
    const startLine = readOptionalPositiveInteger(argumentsValue, 'start_line', 1)
    const maxLines = readOptionalBoundedPositiveInteger(argumentsValue, 'max_lines', DEFAULT_READ_LINE_COUNT, 500)
    const hasEndLine = argumentsValue.end_line !== undefined
    const endLine = hasEndLine ? readOptionalPositiveInteger(argumentsValue, 'end_line', startLine) : undefined
    const requestedLineCount = endLine === undefined ? maxLines : endLine - startLine + 1
    const normalizedEndLine = endLine ?? startLine + requestedLineCount - 1

    return JSON.stringify({
      absolutePath: readNormalizedAbsolutePath(argumentsValue, agentContextRootPath),
      endLine: normalizedEndLine,
      startLine,
      toolName: toolCall.name,
    })
  }

  if (toolCall.name === 'glob') {
    return JSON.stringify({
      absolutePath: readNormalizedAbsolutePath(argumentsValue, agentContextRootPath),
      maxResults: readOptionalBoundedPositiveInteger(argumentsValue, 'max_results', DEFAULT_SEARCH_RESULT_LIMIT, 1000),
      pattern: readRequiredString(argumentsValue, 'pattern', true),
      toolName: toolCall.name,
    })
  }

  if (toolCall.name === 'grep') {
    return JSON.stringify({
      absolutePath: readNormalizedAbsolutePath(argumentsValue, agentContextRootPath),
      caseSensitive: readOptionalBoolean(argumentsValue, 'case_sensitive', false),
      isRegex: readOptionalBoolean(argumentsValue, 'is_regex', false),
      maxResults: readOptionalBoundedPositiveInteger(argumentsValue, 'max_results', DEFAULT_SEARCH_RESULT_LIMIT, 1000),
      pattern: readRequiredString(argumentsValue, 'pattern', true),
      toolName: toolCall.name,
    })
  }

  return null
}

function toDisplayTargetPath(semanticResult: Record<string, unknown>) {
  const subjectPath = semanticResult.path
  return typeof subjectPath === 'string' && subjectPath.trim().length > 0 ? subjectPath.trim() : 'the requested path'
}

function buildInspectionReuseHint(toolName: InspectionToolName, semanticResult: Record<string, unknown>) {
  const displayTargetPath = toDisplayTargetPath(semanticResult)

  if (toolName === 'list') {
    return `the previous authoritative directory listing for ${displayTargetPath}`
  }

  if (toolName === 'read') {
    const startLine = typeof semanticResult.startLine === 'number' ? semanticResult.startLine : 1
    const endLine =
      typeof semanticResult.endLine === 'number'
        ? semanticResult.endLine
        : typeof semanticResult.lineCount === 'number'
          ? startLine + semanticResult.lineCount - 1
          : startLine
    return `the previous authoritative file read for ${displayTargetPath} lines ${startLine}-${endLine}`
  }

  if (toolName === 'glob') {
    const pattern = typeof semanticResult.pattern === 'string' ? semanticResult.pattern : 'the requested pattern'
    return `the previous authoritative path search for ${pattern} in ${displayTargetPath}`
  }

  const pattern = typeof semanticResult.pattern === 'string' ? semanticResult.pattern : 'the requested pattern'
  return `the previous authoritative content search for ${pattern} in ${displayTargetPath}`
}

function createSuccessfulInspectionCall(
  toolCall: OpenAICompatibleToolCall,
  argumentsValue: Record<string, unknown>,
  semanticResult: Record<string, unknown>,
  agentContextRootPath: string,
): SuccessfulInspectionCall | null {
  if (toolCall.name !== 'list' && toolCall.name !== 'read' && toolCall.name !== 'glob' && toolCall.name !== 'grep') {
    return null
  }

  try {
    const key = buildInspectionCallKey(toolCall, argumentsValue, agentContextRootPath)
    if (!key) {
      return null
    }

    return {
      key,
      reuseHint: buildInspectionReuseHint(toolCall.name, semanticResult),
      targetPath: readNormalizedAbsolutePath(argumentsValue, agentContextRootPath),
      toolName: toolCall.name,
    }
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readToolResultMetadataBlocks(content: string) {
  const metadataBlocks: Array<Record<string, unknown>> = []
  const metadataBlockPattern = /<tool_result>\s*([\s\S]*?)\s*<\/tool_result>/g

  let metadataMatch: RegExpExecArray | null
  while ((metadataMatch = metadataBlockPattern.exec(content)) !== null) {
    const metadataText = metadataMatch[1]
    if (!metadataText) {
      continue
    }

    try {
      const parsedMetadata = JSON.parse(metadataText) as unknown
      if (!isRecord(parsedMetadata)) {
        continue
      }

      if (parsedMetadata.schema !== 'echosphere.tool_result/v1') {
        continue
      }

      if (parsedMetadata.status !== 'success') {
        continue
      }

      if (typeof parsedMetadata.toolName !== 'string' || typeof parsedMetadata.toolCallId !== 'string') {
        continue
      }

      metadataBlocks.push(parsedMetadata)
    } catch {
      continue
    }
  }

  return metadataBlocks
}

function toInspectionToolCallFromMetadata(metadata: Record<string, unknown>): OpenAICompatibleToolCall | null {
  const toolName = metadata.toolName
  if (toolName !== 'list' && toolName !== 'read' && toolName !== 'glob' && toolName !== 'grep') {
    return null
  }

  if (!isRecord(metadata.arguments)) {
    return null
  }

  return {
    argumentsText: JSON.stringify(metadata.arguments),
    id: metadata.toolCallId as string,
    name: toolName,
    startedAt: 0,
  }
}

function toMutationTargetPathFromMetadata(
  metadata: Record<string, unknown>,
  agentContextRootPath: string,
) {
  if (!isRecord(metadata.semantics) || metadata.semantics.content_changed !== true) {
    return null
  }

  if (isRecord(metadata.subject) && typeof metadata.subject.path === 'string') {
    const normalizedSubjectPath = readNormalizedSubjectPath(metadata.subject.path, agentContextRootPath)
    if (normalizedSubjectPath) {
      return normalizedSubjectPath
    }
  }

  if (!isRecord(metadata.arguments)) {
    return null
  }

  try {
    return readNormalizedAbsolutePath(metadata.arguments, agentContextRootPath)
  } catch {
    return null
  }
}

function doesMutationAffectInspection(mutationPath: string, inspectionCall: SuccessfulInspectionCall) {
  if (inspectionCall.toolName === 'read') {
    return mutationPath === inspectionCall.targetPath
  }

  return isSamePathOrDescendant(inspectionCall.targetPath, mutationPath)
}

function invalidateAffectedInspections(
  targetPath: string,
  inspectionCallsByKey: Map<string, SuccessfulInspectionCall>,
) {
  for (const [inspectionCallKey, inspectionCall] of inspectionCallsByKey.entries()) {
    if (doesMutationAffectInspection(targetPath, inspectionCall)) {
      inspectionCallsByKey.delete(inspectionCallKey)
    }
  }
}

function registerMutationCall(
  argumentsValue: Record<string, unknown>,
  semanticResult: Record<string, unknown>,
  agentContextRootPath: string,
  turnState: ToolExecutionTurnState,
) {
  if (semanticResult.contentChanged !== true) {
    return
  }

  if (typeof semanticResult.path === 'string') {
    try {
      const normalizedSubjectPath = readNormalizedSubjectPath(semanticResult.path, agentContextRootPath)
      if (normalizedSubjectPath) {
        invalidateAffectedInspections(normalizedSubjectPath, turnState.inspectionCallsByKey)
        return
      }
    } catch {
      // Fall back to argument-based path handling.
    }
  }

  try {
    invalidateAffectedInspections(
      readNormalizedAbsolutePath(argumentsValue, agentContextRootPath),
      turnState.inspectionCallsByKey,
    )
  } catch {
    // Unknown mutation scope is safest as full inspection invalidation.
    turnState.inspectionCallsByKey.clear()
  }
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return {
    inspectionCallsByKey: new Map<string, SuccessfulInspectionCall>(),
  }
}

export function hydrateToolExecutionTurnStateFromMessages(
  messages: Message[],
  agentContextRootPath: string,
  turnState: ToolExecutionTurnState,
) {
  for (const message of messages) {
    if (typeof message.content !== 'string' || message.content.trim().length === 0) {
      continue
    }

    const metadataBlocks = readToolResultMetadataBlocks(message.content)
    for (const metadata of metadataBlocks) {
      const inspectionToolCall = toInspectionToolCallFromMetadata(metadata)
      if (inspectionToolCall) {
        try {
          const inspectionCallKey = buildInspectionCallKey(
            inspectionToolCall,
            metadata.arguments as Record<string, unknown>,
            agentContextRootPath,
          )
          if (!inspectionCallKey) {
            continue
          }

          const summary = typeof metadata.summary === 'string' && metadata.summary.trim().length > 0
            ? metadata.summary.trim()
            : `the latest successful ${inspectionToolCall.name} result`
          turnState.inspectionCallsByKey.set(inspectionCallKey, {
            key: inspectionCallKey,
            reuseHint: summary,
            targetPath: readNormalizedAbsolutePath(metadata.arguments as Record<string, unknown>, agentContextRootPath),
            toolName: inspectionToolCall.name as InspectionToolName,
          })
        } catch {
          // Skip malformed historical entries and continue hydrating from the rest.
        }
      }

      if (metadata.toolName === 'patch') {
        const mutationTargetPath = toMutationTargetPathFromMetadata(metadata, agentContextRootPath)
        if (mutationTargetPath) {
          invalidateAffectedInspections(mutationTargetPath, turnState.inspectionCallsByKey)
        }
      }
    }
  }
}

export function getDuplicateInspectionCallError(
  toolCall: OpenAICompatibleToolCall,
  argumentsValue: Record<string, unknown>,
  agentContextRootPath: string,
  turnState: ToolExecutionTurnState,
): DuplicateInspectionCallError | null {
  if (toolCall.name !== 'list' && toolCall.name !== 'read' && toolCall.name !== 'glob' && toolCall.name !== 'grep') {
    return null
  }

  let inspectionCallKey: string | null
  try {
    inspectionCallKey = buildInspectionCallKey(toolCall, argumentsValue, agentContextRootPath)
  } catch {
    return null
  }

  if (!inspectionCallKey) {
    return null
  }

  const previousInspection = turnState.inspectionCallsByKey.get(inspectionCallKey)
  if (!previousInspection) {
    return null
  }

  return {
    details: {
      reusedHint: previousInspection.reuseHint,
      targetPath: previousInspection.targetPath,
      toolName: toolCall.name,
    },
    message: `Duplicate inspection call blocked. Reuse ${previousInspection.reuseHint} before issuing the same ${toolCall.name} call again.`,
  }
}

export function recordSuccessfulToolExecution(
  toolCall: OpenAICompatibleToolCall,
  argumentsValue: Record<string, unknown>,
  semanticResult: Record<string, unknown>,
  agentContextRootPath: string,
  turnState: ToolExecutionTurnState,
) {
  const successfulInspectionCall = createSuccessfulInspectionCall(
    toolCall,
    argumentsValue,
    semanticResult,
    agentContextRootPath,
  )
  if (successfulInspectionCall) {
    turnState.inspectionCallsByKey.set(successfulInspectionCall.key, successfulInspectionCall)
    return
  }

  if (toolCall.name === 'patch') {
    registerMutationCall(argumentsValue, semanticResult, agentContextRootPath, turnState)
  }
}
