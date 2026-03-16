import { getDiffSummary } from '../../../src/lib/textDiff'
import type { ToolInvocationResultPresentation } from '../../../src/types/chat'
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
  const content = typeof semanticResult.content === 'string' ? semanticResult.content : ''
  const fenceLanguage = inferFenceLanguage(subjectPath)
  const lines = [
    `File ${subjectPath} (lines ${startLine}-${endLine}${totalLineCount === null ? '' : ` of ${totalLineCount}`})`,
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

function formatUpdatePlanResultBody(semanticResult: Record<string, unknown>) {
  const planId = readString(semanticResult.planId) ?? 'default'
  const steps = Array.isArray(semanticResult.steps)
    ? semanticResult.steps.filter((step): step is Record<string, unknown> => typeof step === 'object' && step !== null)
    : []
  const truncate = (value: string, maxLength = 80) => (value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`)
  const lines = [planId]

  if (steps.length === 0) {
    lines.push('Steps: none')
  } else {
    for (const step of steps) {
      const stepId = readString(step.id) ?? '?'
      const stepStatus = readString(step.status) ?? 'pending'
      const stepTitle = truncate(readString(step.title) ?? 'Untitled step')
      lines.push(`${stepId}. [${stepStatus}] ${stepTitle}`)
    }
  }

  const allStepsCompleted = readBoolean(semanticResult.allStepsCompleted)
  if (allStepsCompleted) {
    lines.push('All plan steps are completed.')
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

  if (toolName === 'write' || toolName === 'edit') {
    return formatMutationResultBody(semanticResult)
  }

  if (toolName === 'exec_command' || toolName === 'write_stdin') {
    return formatTerminalResultBody(semanticResult)
  }

  if (toolName === 'update_plan') {
    return formatUpdatePlanResultBody(semanticResult)
  }

  return formatFallbackResultBody(semanticResult)
}

export function formatFailureResultBody(errorMessage: string, details?: Record<string, unknown>) {
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

export function buildResultPresentation(
  toolName: string,
  semanticResult: Record<string, unknown>,
): ToolInvocationResultPresentation | undefined {
  if (toolName !== 'write' && toolName !== 'edit') {
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
