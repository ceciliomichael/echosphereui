import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { getDiffSummary } from '../../../src/lib/textDiff'
import {
  formatStructuredToolResultContent,
  parseStructuredToolResultContent,
  type StructuredToolResultMetadata,
} from '../../../src/lib/toolResultContent'
import type { Message, ToolInvocationResultPresentation, ToolInvocationTrace } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from './toolTypes'

interface ListToolEntry {
  kind?: unknown
  name?: unknown
}

interface GrepMatch {
  columnNumber?: unknown
  lineNumber?: unknown
  lineText?: unknown
  path?: unknown
}

function formatArgumentsText(argumentsText: string) {
  if (argumentsText.trim().length === 0) {
    return '{}'
  }

  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    if (typeof parsedValue !== 'object' || parsedValue === null) {
      return argumentsText
    }

    return JSON.stringify(parsedValue, null, 2)
  } catch {
    return argumentsText
  }
}

function parseArguments(argumentsText: string) {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    return typeof parsedValue === 'object' && parsedValue !== null ? (parsedValue as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function inferFenceLanguage(filePath: string) {
  const normalizedFileName = path.basename(filePath).trim().toLowerCase()
  if (normalizedFileName.length === 0) {
    return null
  }

  if (normalizedFileName === 'dockerfile' || normalizedFileName === 'makefile') {
    return normalizedFileName
  }

  if (normalizedFileName.startsWith('.')) {
    const dotfileLanguage = normalizedFileName.slice(1)
    return dotfileLanguage.length > 0 ? dotfileLanguage : null
  }

  const extension = path.extname(normalizedFileName).slice(1)
  return extension.length > 0 ? extension : null
}

function readListEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as ListToolEntry) : null))
    .filter((entry): entry is ListToolEntry => entry !== null)
}

function readGrepMatches(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as GrepMatch) : null))
    .filter((entry): entry is GrepMatch => entry !== null)
}

function appendTruncationNotice(lines: string[], truncated: boolean) {
  if (truncated) {
    lines.push('Results truncated.')
  }
}

function formatTreeLine(name: string, kind: unknown, isLast: boolean) {
  const suffix = kind === 'directory' ? '/' : ''
  const prefix = isLast ? '└─ ' : '├─ '
  return `${prefix}${name}${suffix}`
}

function formatListResultBody(semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path) ?? '.'
  const lines = [`Directory ${subjectPath}`]
  const entries = readListEntries(semanticResult.entries)

  for (const [index, entry] of entries.entries()) {
    const name = readString(entry.name)
    if (!name) {
      continue
    }

    lines.push(formatTreeLine(name, entry.kind, index === entries.length - 1))
  }

  appendTruncationNotice(lines, readBoolean(semanticResult.truncated))
  return lines.join('\n')
}

function formatReadResultBody(semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path) ?? 'unknown'
  const startLine = readNumber(semanticResult.startLine) ?? 1
  const endLine = readNumber(semanticResult.endLine) ?? startLine
  const content = typeof semanticResult.content === 'string' ? semanticResult.content : ''
  const fenceLanguage = inferFenceLanguage(subjectPath)
  const lines = [`File ${subjectPath} (lines ${startLine}-${endLine})`, `\`\`\`${fenceLanguage ?? ''}`, content, '```']

  appendTruncationNotice(lines, readBoolean(semanticResult.truncated))
  return lines.join('\n')
}

function formatGlobResultBody(semanticResult: Record<string, unknown>) {
  const pattern = readString(semanticResult.pattern) ?? '*'
  const subjectPath = readString(semanticResult.path) ?? '.'
  const matches = Array.isArray(semanticResult.matches)
    ? semanticResult.matches.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
  const lines = [`Paths matching ${pattern} in ${subjectPath}`, ...matches]

  appendTruncationNotice(lines, readBoolean(semanticResult.truncated))
  return lines.join('\n')
}

function formatGrepResultBody(semanticResult: Record<string, unknown>) {
  const pattern = readString(semanticResult.pattern) ?? ''
  const lines = [`Search hits for ${pattern}`]

  for (const match of readGrepMatches(semanticResult.matches)) {
    const matchPath = readString(match.path)
    const lineNumber = readNumber(match.lineNumber)
    const columnNumber = readNumber(match.columnNumber)
    const lineText = typeof match.lineText === 'string' ? match.lineText : ''

    if (!matchPath || lineNumber === null || columnNumber === null) {
      continue
    }

    lines.push(`${matchPath}:${lineNumber}:${columnNumber}: ${lineText}`)
  }

  appendTruncationNotice(lines, readBoolean(semanticResult.truncated))
  return lines.join('\n')
}

function formatMutationResultBody(semanticResult: Record<string, unknown>) {
  const message = readString(semanticResult.message)
  return message ?? 'Tool completed successfully.'
}

function formatFallbackResultBody(semanticResult: Record<string, unknown>) {
  return JSON.stringify(semanticResult, null, 2)
}

function formatSuccessResultBody(toolName: string, semanticResult: Record<string, unknown>) {
  if (toolName === 'list') {
    return formatListResultBody(semanticResult)
  }

  if (toolName === 'read') {
    return formatReadResultBody(semanticResult)
  }

  if (toolName === 'glob') {
    return formatGlobResultBody(semanticResult)
  }

  if (toolName === 'grep') {
    return formatGrepResultBody(semanticResult)
  }

  if (toolName === 'write' || toolName === 'edit') {
    return formatMutationResultBody(semanticResult)
  }

  return formatFallbackResultBody(semanticResult)
}

function formatFailureResultBody(errorMessage: string, details?: Record<string, unknown>) {
  const lines = [`Tool failed: ${errorMessage}`]

  if (details) {
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        lines.push(`${key}: ${value}`)
      }
    }
  }

  return lines.join('\n')
}

function buildResultPresentation(
  toolName: string,
  semanticResult: Record<string, unknown>,
): ToolInvocationResultPresentation | undefined {
  if (toolName !== 'edit' && toolName !== 'write') {
    return undefined
  }

  const fileName = readString(semanticResult.path)
  const oldContent =
    semanticResult.oldContent === null || typeof semanticResult.oldContent === 'string' ? semanticResult.oldContent : null
  const newContent = typeof semanticResult.newContent === 'string' ? semanticResult.newContent : null

  if (!fileName || newContent === null) {
    return undefined
  }

  const contextLines = readNumber(semanticResult.contextLines) ?? undefined
  const endLineNumber = readNumber(semanticResult.endLineNumber) ?? undefined
  const startLineNumber = readNumber(semanticResult.startLineNumber) ?? undefined
  const { addedLineCount, removedLineCount } = getDiffSummary(oldContent, newContent)

  return {
    addedLineCount,
    fileName,
    kind: 'file_diff',
    newContent,
    oldContent,
    removedLineCount,
    ...(contextLines === undefined ? {} : { contextLines }),
    ...(endLineNumber === undefined ? {} : { endLineNumber }),
    ...(startLineNumber === undefined ? {} : { startLineNumber }),
  }
}

function buildArgumentsSummary(toolName: string, argumentsText: string) {
  const argumentsValue = parseArguments(argumentsText)
  if (!argumentsValue) {
    return undefined
  }

  if (toolName === 'list') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      limit: readNumber(argumentsValue.limit) ?? undefined,
    }
  }

  if (toolName === 'read') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      max_lines: readNumber(argumentsValue.max_lines) ?? undefined,
      start_line: readNumber(argumentsValue.start_line) ?? undefined,
    }
  }

  if (toolName === 'glob') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      max_results: readNumber(argumentsValue.max_results) ?? undefined,
      pattern: readString(argumentsValue.pattern) ?? undefined,
    }
  }

  if (toolName === 'grep') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      case_sensitive: readBoolean(argumentsValue.case_sensitive),
      is_regex: readBoolean(argumentsValue.is_regex),
      max_results: readNumber(argumentsValue.max_results) ?? undefined,
      pattern: readString(argumentsValue.pattern) ?? undefined,
    }
  }

  if (toolName === 'write') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
    }
  }

  if (toolName === 'edit') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      replace_all: readBoolean(argumentsValue.replace_all),
    }
  }

  return undefined
}

function buildSuccessSummary(toolName: string, semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path) ?? 'unknown'
  const truncated = readBoolean(semanticResult.truncated)

  if (toolName === 'list') {
    const entryCount = readNumber(semanticResult.entryCount) ?? readListEntries(semanticResult.entries).length
    return `Listed ${subjectPath} with ${entryCount} visible entr${entryCount === 1 ? 'y' : 'ies'}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'read') {
    const startLine = readNumber(semanticResult.startLine) ?? 1
    const endLine = readNumber(semanticResult.endLine) ?? startLine
    return `Read ${subjectPath} lines ${startLine}-${endLine}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'glob') {
    const matchCount = readNumber(semanticResult.matchCount) ?? 0
    const pattern = readString(semanticResult.pattern) ?? '*'
    return `Found ${matchCount} path match${matchCount === 1 ? '' : 'es'} for ${pattern} in ${subjectPath}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'grep') {
    const matchCount = readNumber(semanticResult.matchCount) ?? 0
    const pattern = readString(semanticResult.pattern) ?? ''
    return `Found ${matchCount} search hit${matchCount === 1 ? '' : 's'} for ${pattern} in ${subjectPath}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'write' || toolName === 'edit') {
    return readString(semanticResult.message) ?? 'Tool completed successfully.'
  }

  return 'Tool completed successfully.'
}

function buildSubject(toolName: string, semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path)
  if (!subjectPath) {
    return undefined
  }

  const defaultKind =
    toolName === 'list' ? 'directory' : toolName === 'glob' || toolName === 'grep' ? 'path' : 'file'
  return {
    kind: readString(semanticResult.targetKind) ?? defaultKind,
    path: subjectPath,
  }
}

function filterUndefinedEntries(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function buildSuccessSemantics(toolName: string, semanticResult: Record<string, unknown>) {
  const sharedSemantics = { authoritative: true }

  if (toolName === 'list') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      entry_count: readNumber(semanticResult.entryCount) ?? readListEntries(semanticResult.entries).length,
      total_visible_entry_count: readNumber(semanticResult.totalVisibleEntryCount) ?? undefined,
    })
  }

  if (toolName === 'read') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      end_line: readNumber(semanticResult.endLine) ?? undefined,
      language: inferFenceLanguage(readString(semanticResult.path) ?? ''),
      line_count: readNumber(semanticResult.lineCount) ?? undefined,
      start_line: readNumber(semanticResult.startLine) ?? undefined,
    })
  }

  if (toolName === 'glob') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      match_count: readNumber(semanticResult.matchCount) ?? undefined,
      pattern: readString(semanticResult.pattern) ?? undefined,
      total_match_count: readNumber(semanticResult.totalMatchCount) ?? undefined,
    })
  }

  if (toolName === 'grep') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      match_count: readNumber(semanticResult.matchCount) ?? undefined,
      pattern: readString(semanticResult.pattern) ?? undefined,
    })
  }

  if (toolName === 'write') {
    const operation = readString(semanticResult.operation) ?? undefined
    return filterUndefinedEntries({
      ...sharedSemantics,
      content_changed: readBoolean(semanticResult.contentChanged),
      end_line_number: readNumber(semanticResult.endLineNumber) ?? undefined,
      mutation_applied: operation === 'create' || operation === 'overwrite',
      operation,
      target_exists_after_call: true,
      workspace_effect:
        operation === 'create'
          ? 'file_created'
          : operation === 'overwrite'
            ? 'file_overwritten'
            : operation === 'noop'
              ? 'file_already_matched'
              : undefined,
      start_line_number: readNumber(semanticResult.startLineNumber) ?? undefined,
    })
  }

  if (toolName === 'edit') {
    const operation = readString(semanticResult.operation) ?? undefined
    return filterUndefinedEntries({
      ...sharedSemantics,
      content_changed: readBoolean(semanticResult.contentChanged),
      end_line_number: readNumber(semanticResult.endLineNumber) ?? undefined,
      mutation_applied: operation !== 'noop',
      operation,
      replacement_count: readNumber(semanticResult.replacementCount) ?? undefined,
      start_line_number: readNumber(semanticResult.startLineNumber) ?? undefined,
      target_exists_after_call: true,
      workspace_effect: operation === 'noop' ? 'file_already_matched' : 'file_edited',
    })
  }

  return {}
}

function buildSuccessMetadata(
  toolCall: OpenAICompatibleToolCall,
  semanticResult: Record<string, unknown>,
): StructuredToolResultMetadata {
  const argumentsSummary = buildArgumentsSummary(toolCall.name, toolCall.argumentsText)
  const subject = buildSubject(toolCall.name, semanticResult)
  const semantics = buildSuccessSemantics(toolCall.name, semanticResult)

  return {
    ...(argumentsSummary === undefined ? {} : { arguments: filterUndefinedEntries(argumentsSummary) }),
    schema: 'echosphere.tool_result/v1',
    ...(Object.keys(semantics).length === 0 ? {} : { semantics }),
    status: 'success',
    ...(subject === undefined ? {} : { subject }),
    summary: buildSuccessSummary(toolCall.name, semanticResult),
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    ...(readBoolean(semanticResult.truncated) ? { truncated: true } : {}),
  }
}

function buildFailureMetadata(
  toolCall: OpenAICompatibleToolCall,
  errorMessage: string,
  details?: Record<string, unknown>,
): StructuredToolResultMetadata {
  const argumentsSummary = buildArgumentsSummary(toolCall.name, toolCall.argumentsText)
  const semantics = filterUndefinedEntries({
    authoritative: true,
    ...(details ? { details } : {}),
    error_message: errorMessage,
  })

  return {
    ...(argumentsSummary === undefined ? {} : { arguments: filterUndefinedEntries(argumentsSummary) }),
    schema: 'echosphere.tool_result/v1',
    ...(Object.keys(semantics).length === 0 ? {} : { semantics }),
    status: 'error',
    summary: errorMessage,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  }
}

export function buildStartedToolInvocation(toolCall: OpenAICompatibleToolCall, startedAt: number): ToolInvocationTrace {
  return {
    argumentsText: formatArgumentsText(toolCall.argumentsText),
    id: toolCall.id,
    startedAt,
    state: 'running',
    toolName: toolCall.name,
  }
}

export function buildSuccessfulToolArtifacts(
  toolCall: OpenAICompatibleToolCall,
  semanticResult: Record<string, unknown>,
  startedAt: number,
  completedAt: number,
) {
  const resultBody = formatSuccessResultBody(toolCall.name, semanticResult)
  const resultContent = formatStructuredToolResultContent(buildSuccessMetadata(toolCall, semanticResult), resultBody)
  const resultPresentation = buildResultPresentation(toolCall.name, semanticResult)
  const syntheticMessage: Message = {
    content: resultContent,
    id: randomUUID(),
    role: 'tool',
    timestamp: completedAt,
    toolCallId: toolCall.id,
  }

  return {
    resultContent,
    resultPresentation,
    semanticResult,
    syntheticMessage,
    toolInvocation: {
      argumentsText: formatArgumentsText(toolCall.argumentsText),
      completedAt,
      id: toolCall.id,
      resultContent,
      resultPresentation,
      startedAt,
      state: 'completed',
      toolName: toolCall.name,
    } satisfies ToolInvocationTrace,
  }
}

export function buildFailedToolArtifacts(
  toolCall: OpenAICompatibleToolCall,
  errorMessage: string,
  startedAt: number,
  completedAt: number,
  details?: Record<string, unknown>,
) {
  const resultBody = formatFailureResultBody(errorMessage, details)
  const resultContent = formatStructuredToolResultContent(buildFailureMetadata(toolCall, errorMessage, details), resultBody)
  const syntheticMessage: Message = {
    content: resultContent,
    id: randomUUID(),
    role: 'tool',
    timestamp: completedAt,
    toolCallId: toolCall.id,
  }

  return {
    resultContent,
    syntheticMessage,
    toolInvocation: {
      argumentsText: formatArgumentsText(toolCall.argumentsText),
      completedAt,
      id: toolCall.id,
      resultContent,
      resultPresentation: undefined,
      startedAt,
      state: 'failed',
      toolName: toolCall.name,
    } satisfies ToolInvocationTrace,
  }
}

export function buildCodexGroupedToolResultContent(toolContents: string[]) {
  if (toolContents.length === 0) {
    return null
  }

  const toolSummaryLines: string[] = []
  const latestMutationStateByPath = new Map<string, { operation: string | null; path: string; toolName: string }>()

  for (const toolContent of toolContents) {
    const parsedResult = parseStructuredToolResultContent(toolContent)
    const metadata = parsedResult.metadata
    if (!metadata) {
      continue
    }

    const toolSummary = metadata.summary.trim()
    if (toolSummary.length > 0) {
      const statusPrefix = metadata.status === 'success' ? 'success' : 'failure'
      toolSummaryLines.push(`- ${metadata.toolName} ${statusPrefix}: ${toolSummary}`)
    }

    if (metadata.status !== 'success') {
      continue
    }

    if (metadata.toolName !== 'write' && metadata.toolName !== 'edit') {
      continue
    }

    const subjectPath = metadata.subject?.path
    if (typeof subjectPath !== 'string' || subjectPath.trim().length === 0) {
      continue
    }

    const normalizedPath = subjectPath.trim()
    const semantics = metadata.semantics
    const operation =
      semantics && typeof semantics.operation === 'string' && semantics.operation.trim().length > 0
        ? semantics.operation.trim()
        : null

    // Preserve latest-wins ordering for repeated mutations on the same path.
    if (latestMutationStateByPath.has(normalizedPath)) {
      latestMutationStateByPath.delete(normalizedPath)
    }

    latestMutationStateByPath.set(normalizedPath, {
      operation,
      path: normalizedPath,
      toolName: metadata.toolName,
    })
  }

  const latestMutationStateLines = Array.from(latestMutationStateByPath.values()).map((entry) => {
    if (entry.toolName === 'write') {
      if (entry.operation === 'create') {
        return `- ${entry.path} now exists in the workspace after a successful write create.`
      }

      if (entry.operation === 'overwrite') {
        return `- ${entry.path} now reflects the latest successful write content.`
      }

      if (entry.operation === 'noop') {
        return `- ${entry.path} already matched the requested write content and remains unchanged.`
      }
    }

    if (entry.toolName === 'edit') {
      if (entry.operation === 'noop') {
        return `- ${entry.path} already matched the requested edit outcome and remains unchanged.`
      }

      return `- ${entry.path} now reflects the latest successful edit changes.`
    }

    const operationSuffix = entry.operation ? ` (${entry.operation})` : ''
    return `- ${entry.path}: ${entry.toolName}${operationSuffix}`
  })
  const mutationStateSummary =
    latestMutationStateLines.length > 0
      ? ['Latest acknowledged workspace file state:', ...latestMutationStateLines].join('\n')
      : null
  const toolSummarySection =
    toolSummaryLines.length > 0 ? ['Acknowledged tool result summaries:', ...toolSummaryLines].join('\n') : null

  return [
    'Authoritative tool results from the immediately preceding tool calls. For each mutated path, the latest successful mutation below is the current workspace state.',
    ...(toolSummarySection ? [toolSummarySection] : []),
    ...(mutationStateSummary ? [mutationStateSummary] : []),
    ...toolContents,
  ].join('\n\n')
}
