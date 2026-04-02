import { getDiffSummary } from '../../../src/lib/textDiff'
import type { FileChangeDiffToolResultItem, ToolInvocationResultPresentation } from '../../../src/types/chat'
import {
  inferFenceLanguage,
  readBoolean,
  readGrepMatches,
  readListEntries,
  readNumber,
  readString,
} from './toolResultSupport'

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
  const totalLineCount = readNumber(semanticResult.totalLineCount)
  const hasMoreLines = readBoolean(semanticResult.hasMoreLines)
  const remainingLineCount = readNumber(semanticResult.remainingLineCount)
  const coverageLabel = hasMoreLines ? `partial${remainingLineCount !== null ? `, ${remainingLineCount} lines remaining` : ''}` : 'complete'
  const content = typeof semanticResult.content === 'string' ? semanticResult.content : ''
  const fenceLanguage = inferFenceLanguage(subjectPath)
  const lines = [
    `File ${subjectPath} (lines ${startLine}-${endLine}${totalLineCount === null ? '' : ` of ${totalLineCount}`}, ${coverageLabel})`,
    `\`\`\`${fenceLanguage ?? ''}`,
    content,
    '```',
  ]

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
  if (Array.isArray(semanticResult.changes)) {
    return formatFileChangeResultBody(semanticResult)
  }

  const message = readString(semanticResult.message) ?? 'Tool completed successfully.'
  const path = readString(semanticResult.path)
  const newContent = typeof semanticResult.newContent === 'string' ? semanticResult.newContent : null
  const operation = readString(semanticResult.operation)
  const addedPaths = Array.isArray(semanticResult.addedPaths)
    ? semanticResult.addedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
  const modifiedPaths = Array.isArray(semanticResult.modifiedPaths)
    ? semanticResult.modifiedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
  const deletedPaths = Array.isArray(semanticResult.deletedPaths)
    ? semanticResult.deletedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : []
  const changedPaths = [...addedPaths, ...modifiedPaths, ...deletedPaths]
  const lines = [message]

  if (path && operation === 'edit') {
    lines.push(`Current workspace state for ${path} is authoritative.`)
  }

  if (changedPaths.length > 0) {
    lines.push(`Changed paths: ${changedPaths.join(', ')}`)
  }

  if (path && newContent !== null) {
    const fenceLanguage = inferFenceLanguage(path) ?? ''
    lines.push(`Current content of ${path}:`, `\`\`\`${fenceLanguage}`, newContent, '```')
  }

  return lines.join('\n')
}

function formatTerminalResultBody(semanticResult: Record<string, unknown>) {
  const output = typeof semanticResult.output === 'string' ? semanticResult.output : ''
  if (output.length > 0) {
    return output
  }

  const message = readString(semanticResult.message)
  return message ?? 'Terminal command completed.'
}

function formatFileChangeResultBody(semanticResult: Record<string, unknown>) {
  const changes = Array.isArray(semanticResult.changes)
    ? semanticResult.changes.filter((change): change is Record<string, unknown> => typeof change === 'object' && change !== null)
    : []

  if (changes.length === 0) {
    return readString(semanticResult.message) ?? 'File changes completed.'
  }

  const groupedChanges = new Map<'add' | 'delete' | 'update', Record<string, unknown>[]>()
  for (const change of changes) {
    const kind = readString(change.kind)
    if (kind !== 'add' && kind !== 'delete' && kind !== 'update') {
      continue
    }

    const bucket = groupedChanges.get(kind) ?? []
    bucket.push(change)
    groupedChanges.set(kind, bucket)
  }

  const sections: string[] = []
  for (const kind of ['update', 'add', 'delete'] as const) {
    const grouped = groupedChanges.get(kind)
    if (!grouped || grouped.length === 0) {
      continue
    }

    const verb =
      kind === 'add'
        ? grouped.length === 1
          ? 'Created'
          : 'Created'
        : kind === 'delete'
          ? grouped.length === 1
            ? 'Deleted'
            : 'Deleted'
          : grouped.length === 1
            ? 'Updated'
            : 'Updated'

    sections.push(`${verb} ${grouped.length} file${grouped.length === 1 ? '' : 's'}.`)
    for (const change of grouped) {
      const fileName = readString(change.fileName) ?? 'unknown'
      sections.push(`${verb} ${fileName}.`)
    }
  }

  return sections.length > 0 ? sections.join('\n') : readString(semanticResult.message) ?? 'File changes completed.'
}

function formatReadyImplementResultBody(semanticResult: Record<string, unknown>) {
  const selectedOptionLabel = readString(semanticResult.selectedOptionLabel)
  const answerText = readString(semanticResult.answerText)
  const message = readString(semanticResult.message)
  const lines = [message ?? 'Implementation gate decision received.']

  if (selectedOptionLabel) {
    lines.push(`Selected option: ${selectedOptionLabel}`)
  } else if (answerText) {
    lines.push(`Answer: ${answerText}`)
  }

  const nextChatMode = readString(semanticResult.nextChatMode)
  if (nextChatMode === 'agent') {
    lines.push('Next mode: agent')
  } else if (nextChatMode === 'plan') {
    lines.push('Next mode: plan')
  }

  return lines.join('\n')
}

function formatAskQuestionResultBody(semanticResult: Record<string, unknown>) {
  const message = readString(semanticResult.message) ?? 'Planning question answered.'
  const answerText = readString(semanticResult.answerText)
  const selectedOptionLabel = readString(semanticResult.selectedOptionLabel)
  const lines = [message]

  if (selectedOptionLabel) {
    lines.push(`Selected option: ${selectedOptionLabel}`)
  } else if (answerText) {
    lines.push(`Custom answer: ${answerText}`)
  }

  const usedCustomAnswer = readBoolean(semanticResult.usedCustomAnswer)
  if (usedCustomAnswer) {
    lines.push('Source: custom answer')
  }

  return lines.join('\n')
}

function formatFallbackResultBody(semanticResult: Record<string, unknown>) {
  return JSON.stringify(semanticResult, null, 2)
}

export function formatSuccessResultBody(toolName: string, semanticResult: Record<string, unknown>) {
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

  if (toolName === 'write' || toolName === 'edit' || toolName === 'apply_patch') {
    return formatMutationResultBody(semanticResult)
  }

  if (toolName === 'file_change') {
    return formatFileChangeResultBody(semanticResult)
  }

  if (toolName === 'run_terminal' || toolName === 'get_terminal_output') {
    return formatTerminalResultBody(semanticResult)
  }

  if (toolName === 'ready_implement') {
    return formatReadyImplementResultBody(semanticResult)
  }

  if (toolName === 'ask_question') {
    return formatAskQuestionResultBody(semanticResult)
  }

  return formatFallbackResultBody(semanticResult)
}

function readApplyPatchFailureHint(details: Record<string, unknown>) {
  const filePath = readString(details.filePath)
  const bestPartialMatchLine = readNumber(details.bestPartialMatchLine)
  const bestPartialMatchPrefixLength = readNumber(details.bestPartialMatchPrefixLength)
  const hunkLineCount = readNumber(details.hunkLineCount)

  const lines = ['Patch context did not match the current file contents.']
  if (filePath) {
    lines.push(`File: ${filePath}`)
  }
  if (bestPartialMatchLine !== null) {
    lines.push(`Closest match line: ${bestPartialMatchLine}`)
  }
  if (bestPartialMatchPrefixLength !== null && hunkLineCount !== null) {
    lines.push(`Matched context lines before mismatch: ${bestPartialMatchPrefixLength}/${hunkLineCount}`)
  }
  lines.push('Hint: read that area again and regenerate the hunk using exact current text.')
  return lines
}

function summarizeFailureDetails(
  toolName: string,
  details: Record<string, unknown>,
) {
  if (
    toolName === 'apply_patch' &&
    typeof details.failureReason === 'string' &&
    details.failureReason === 'hunk_context_mismatch'
  ) {
    return readApplyPatchFailureHint(details)
  }

  if (toolName === 'edit' && typeof details.failureReason === 'string') {
    const filePath = readString(details.filePath)
    const rangeStart = readNumber(details.lineRangeStartLine)
    const rangeEnd = readNumber(details.lineRangeEndLine)
    const lines = [
      details.failureReason === 'old_string_ambiguous'
        ? 'Edit target matched multiple locations.'
        : 'Edit target was not found in the current file content.',
    ]
    if (filePath) {
      lines.push(`File: ${filePath}`)
    }
    if (rangeStart !== null && rangeEnd !== null) {
      lines.push(`Search range: lines ${rangeStart}-${rangeEnd}`)
    }
    lines.push('Hint: read the file again and include more unique surrounding context.')
    return lines
  }

  const lines: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    }
  }
  return lines
}

export function formatFailureResultBody(toolName: string, errorMessage: string, details?: Record<string, unknown>) {
  const lines = [`Tool failed: ${errorMessage}`]

  if (details) {
    lines.push(...summarizeFailureDetails(toolName, details))
  }

  return lines.join('\n')
}

export function buildResultPresentation(
  toolName: string,
  semanticResult: Record<string, unknown>,
): ToolInvocationResultPresentation | undefined {
  if (toolName !== 'write' && toolName !== 'edit' && toolName !== 'apply_patch') {
    if (toolName !== 'file_change') {
      return undefined
    }
  }

  if (toolName === 'file_change' || toolName === 'apply_patch') {
    const changes = Array.isArray(semanticResult.changes)
      ? semanticResult.changes.filter((change): change is Record<string, unknown> => typeof change === 'object' && change !== null)
      : []

    if (changes.length === 0) {
      return undefined
    }

    const presentationChanges: FileChangeDiffToolResultItem[] = []
    for (const change of changes) {
      const fileName = readString(change.fileName)
      const kind = readString(change.kind)
      if (!fileName || (kind !== 'add' && kind !== 'delete' && kind !== 'update')) {
        continue
      }

      const oldContent = typeof change.oldContent === 'string' || change.oldContent === null ? change.oldContent : null
      const newContent = typeof change.newContent === 'string' ? change.newContent : ''
      const { addedLineCount, removedLineCount } = getDiffSummary(oldContent, newContent)

      presentationChanges.push({
        addedLineCount,
        fileName,
        kind,
        newContent,
        oldContent,
        removedLineCount,
        ...(readNumber(change.contextLines) === null ? {} : { contextLines: readNumber(change.contextLines) ?? undefined }),
        ...(readNumber(change.endLineNumber) === null ? {} : { endLineNumber: readNumber(change.endLineNumber) ?? undefined }),
        ...(readNumber(change.startLineNumber) === null ? {} : { startLineNumber: readNumber(change.startLineNumber) ?? undefined }),
      } as FileChangeDiffToolResultItem)
    }

    if (presentationChanges.length === 0) {
      return undefined
    }

    return {
      changes: presentationChanges,
      kind: 'file_change_diff',
    }
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
