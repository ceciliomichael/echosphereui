import { randomUUID } from 'node:crypto'
import path from 'node:path'
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
  const prefix = isLast ? '`- ' : '|- '
  return `${prefix}${name}${suffix}`
}

function formatListResult(semanticResult: Record<string, unknown>) {
  const path = readString(semanticResult.path) ?? '.'
  const lines = [`Directory ${path}`]
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

function formatReadResult(semanticResult: Record<string, unknown>) {
  const path = readString(semanticResult.path) ?? 'unknown'
  const startLine = readNumber(semanticResult.startLine) ?? 1
  const endLine = readNumber(semanticResult.endLine) ?? startLine
  const content = typeof semanticResult.content === 'string' ? semanticResult.content : ''
  const fenceLanguage = inferFenceLanguage(path)
  const lines = [`File ${path} (lines ${startLine}-${endLine})`, `\`\`\`${fenceLanguage ?? ''}`, content, '```']

  appendTruncationNotice(lines, readBoolean(semanticResult.truncated))
  return lines.join('\n')
}

function formatGlobResult(semanticResult: Record<string, unknown>) {
  const pattern = readString(semanticResult.pattern) ?? '*'
  const searchPath = readString(semanticResult.path) ?? '.'
  const matches = Array.isArray(semanticResult.matches)
    ? semanticResult.matches.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
  const lines = [`Paths matching ${pattern} in ${searchPath}`, ...matches]

  appendTruncationNotice(lines, readBoolean(semanticResult.truncated))
  return lines.join('\n')
}

function formatGrepResult(semanticResult: Record<string, unknown>) {
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

function formatMutationResult(semanticResult: Record<string, unknown>) {
  const message = readString(semanticResult.message)
  return message ?? 'Tool completed successfully.'
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

  return {
    fileName,
    kind: 'file_diff',
    newContent,
    oldContent,
    ...(contextLines === undefined ? {} : { contextLines }),
    ...(endLineNumber === undefined ? {} : { endLineNumber }),
    ...(startLineNumber === undefined ? {} : { startLineNumber }),
  }
}

function formatFallbackResult(semanticResult: Record<string, unknown>) {
  return JSON.stringify(semanticResult, null, 2)
}

function formatSuccessResult(toolName: string, semanticResult: Record<string, unknown>) {
  if (toolName === 'list') {
    return formatListResult(semanticResult)
  }

  if (toolName === 'read') {
    return formatReadResult(semanticResult)
  }

  if (toolName === 'glob') {
    return formatGlobResult(semanticResult)
  }

  if (toolName === 'grep') {
    return formatGrepResult(semanticResult)
  }

  if (toolName === 'write' || toolName === 'edit') {
    return formatMutationResult(semanticResult)
  }

  return formatFallbackResult(semanticResult)
}

function formatFailureResult(
  errorMessage: string,
  details?: Record<string, unknown>,
) {
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
  const resultContent = formatSuccessResult(toolCall.name, semanticResult)
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
  const resultContent = formatFailureResult(errorMessage, details)
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

  return ['Tool result context:', ...toolContents].join('\n\n')
}
