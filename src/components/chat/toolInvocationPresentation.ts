import type { ToolInvocationTrace } from '../../types/chat'
import { getRelativeDisplayPath } from '../../lib/pathPresentation'
import { parseStructuredToolResultContent } from '../../lib/toolResultContent'

interface ToolArgumentsValue {
  absolute_path?: unknown
  command?: unknown
  cmd?: unknown
  edits?: unknown
  pattern?: unknown
  query?: unknown
  workdir?: unknown
}

function parseCompleteToolArguments(argumentsText: string): ToolArgumentsValue | null {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    if (typeof parsedValue !== 'object' || parsedValue === null) {
      return null
    }

    return parsedValue as ToolArgumentsValue
  } catch {
    return null
  }
}

function decodePartialJsonString(input: string) {
  let decodedValue = ''

  for (let index = 0; index < input.length; index += 1) {
    const currentCharacter = input[index]
    if (currentCharacter !== '\\') {
      decodedValue += currentCharacter
      continue
    }

    index += 1
    if (index >= input.length) {
      decodedValue += '\\'
      break
    }

    const escapedCharacter = input[index]
    if (escapedCharacter === '"' || escapedCharacter === '\\' || escapedCharacter === '/') {
      decodedValue += escapedCharacter
      continue
    }
    if (escapedCharacter === 'b') {
      decodedValue += '\b'
      continue
    }
    if (escapedCharacter === 'f') {
      decodedValue += '\f'
      continue
    }
    if (escapedCharacter === 'n') {
      decodedValue += '\n'
      continue
    }
    if (escapedCharacter === 'r') {
      decodedValue += '\r'
      continue
    }
    if (escapedCharacter === 't') {
      decodedValue += '\t'
      continue
    }
    if (escapedCharacter === 'u') {
      const unicodeHex = input.slice(index + 1, index + 5)
      if (/^[0-9a-fA-F]{4}$/.test(unicodeHex)) {
        decodedValue += String.fromCharCode(Number.parseInt(unicodeHex, 16))
        index += 4
        continue
      }
    }

    decodedValue += escapedCharacter
  }

  return decodedValue
}

function extractPartialAbsolutePath(argumentsText: string) {
  const absolutePathMatch = argumentsText.match(/"absolute_path"\s*:\s*"((?:\\.|[^"])*)/u)
  if (!absolutePathMatch) {
    return null
  }

  const absolutePath = decodePartialJsonString(absolutePathMatch[1]).trim()
  return absolutePath.length > 0 ? absolutePath : null
}

function getAbsolutePath(invocation: ToolInvocationTrace) {
  const argumentsValue = parseCompleteToolArguments(invocation.argumentsText)
  if (Array.isArray(argumentsValue?.edits)) {
    const firstEdit = argumentsValue.edits[0]
    if (typeof firstEdit === 'object' && firstEdit !== null) {
      const firstEditRecord = firstEdit as Record<string, unknown>
      if (typeof firstEditRecord.absolute_path === 'string' && firstEditRecord.absolute_path.trim().length > 0) {
        return firstEditRecord.absolute_path.trim()
      }
    }
  }

  if (typeof argumentsValue?.absolute_path === 'string' && argumentsValue.absolute_path.trim().length > 0) {
    return argumentsValue.absolute_path.trim()
  }

  if (typeof argumentsValue?.workdir === 'string' && argumentsValue.workdir.trim().length > 0) {
    return argumentsValue.workdir.trim()
  }

  return extractPartialAbsolutePath(invocation.argumentsText)
}

function getBasename(absolutePath: string) {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  return pathSegments[pathSegments.length - 1] ?? absolutePath
}

const MAX_TERMINAL_COMMAND_LABEL_LENGTH = 64

function truncateDisplayText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function readFirstText(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nextValue = readFirstText(entry)
      if (nextValue) {
        return nextValue
      }
    }
    return null
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    for (const candidate of [record.path, record.absolute_path, record.file_path, record.name, record.query, record.command, record.cmd]) {
      const nextValue = readFirstText(candidate)
      if (nextValue) {
        return nextValue
      }
    }
  }

  return null
}

function getSearchTarget(argumentsText: string): string | null {
  const parsedArguments = parseCompleteToolArguments(argumentsText)
  const searchText = readFirstText([parsedArguments?.pattern, parsedArguments?.query])
  return searchText ? truncateDisplayText(searchText, MAX_TERMINAL_COMMAND_LABEL_LENGTH) : null
}

function getToolVerb(invocation: ToolInvocationTrace) {
  const parsedResult = invocation.resultContent ? parseStructuredToolResultContent(invocation.resultContent) : null
  const operation =
    parsedResult?.metadata?.semantics && typeof parsedResult.metadata.semantics.operation === 'string'
      ? parsedResult.metadata.semantics.operation
      : null
  const addedPathCount =
    parsedResult?.metadata?.semantics && typeof parsedResult.metadata.semantics.added_path_count === 'number'
      ? parsedResult.metadata.semantics.added_path_count
      : null

  if (invocation.toolName === 'list') {
    return invocation.state === 'running' ? 'Listing' : invocation.state === 'completed' ? 'Listed' : 'List failed'
  }

  if (invocation.toolName === 'read') {
    return invocation.state === 'running' ? 'Reading' : invocation.state === 'completed' ? 'Read' : 'Read failed'
  }

  if (invocation.toolName === 'glob' || invocation.toolName === 'grep') {
    return invocation.state === 'running'
      ? 'Searching'
      : invocation.state === 'completed'
        ? 'Searched'
        : 'Search failed'
  }

  if (invocation.toolName === 'write') {
    if (invocation.state === 'running') {
      return 'Writing'
    }
    if (invocation.state === 'failed') {
      return 'Write failed'
    }
    return 'Created'
  }

  if (invocation.toolName === 'apply_patch') {
    if (invocation.state === 'running') {
      return 'Editing'
    }
    if (invocation.state === 'failed') {
      return 'Patch failed'
    }
    return 'Edited'
  }

  if (invocation.toolName === 'edit') {
    if (invocation.state === 'running') {
      return 'Editing'
    }
    if (invocation.state === 'failed') {
      return 'Edit failed'
    }
    if (operation === 'noop') {
      return 'Verified'
    }
    return addedPathCount !== null && addedPathCount > 0 ? 'Created' : 'Edited'
  }

  if (invocation.toolName === 'run_terminal') {
    return invocation.state === 'running'
      ? 'Running'
      : invocation.state === 'completed'
        ? 'Ran'
        : 'Run failed'
  }

  if (invocation.toolName === 'get_terminal_output') {
    return invocation.state === 'running'
      ? 'Polling'
      : invocation.state === 'completed'
        ? 'Terminal output'
        : 'Output fetch failed'
  }

  if (invocation.toolName === 'ready_implement') {
    if (invocation.state === 'running' && invocation.decisionRequest) {
      return 'Awaiting implementation approval'
    }

    return invocation.state === 'running'
      ? 'Preparing implementation gate'
      : invocation.state === 'completed'
        ? 'Recorded implementation decision'
        : 'Implementation gate failed'
  }

  if (invocation.toolName === 'ask_question') {
    if (invocation.state === 'running' && invocation.decisionRequest) {
      return 'Awaiting answer'
    }

    return invocation.state === 'running'
      ? 'Asking question'
      : invocation.state === 'completed'
        ? 'Question answered'
        : 'Question failed'
  }

  return invocation.state === 'running'
    ? `Running ${invocation.toolName}`
    : invocation.state === 'completed'
      ? `Completed ${invocation.toolName}`
      : `Failed ${invocation.toolName}`
}

function getToolTarget(invocation: ToolInvocationTrace, workspaceRootPath?: string | null) {
  const parsedArguments = parseCompleteToolArguments(invocation.argumentsText)

  if (invocation.toolName === 'run_terminal') {
    const commandText = readFirstText([parsedArguments?.command, parsedArguments?.cmd])
    return commandText ? truncateDisplayText(commandText, MAX_TERMINAL_COMMAND_LABEL_LENGTH) : null
  }

  if (invocation.toolName === 'glob' || invocation.toolName === 'grep') {
    const searchTarget = getSearchTarget(invocation.argumentsText)
    if (searchTarget) {
      return searchTarget
    }
  }

  const parsedResult = invocation.resultContent ? parseStructuredToolResultContent(invocation.resultContent) : null
  const structuredPath = parsedResult?.metadata?.subject?.path
  if (typeof structuredPath === 'string' && structuredPath.trim().length > 0) {
    const normalizedStructuredPath = structuredPath.trim()
    if ((invocation.toolName === 'edit' || invocation.toolName === 'apply_patch') && normalizedStructuredPath === '.') {
      const absolutePath = getAbsolutePath(invocation)
      return absolutePath ? getBasename(absolutePath) : null
    }

    if (invocation.toolName === 'list' || invocation.toolName === 'glob' || invocation.toolName === 'grep') {
      return normalizedStructuredPath
    }

    return getBasename(normalizedStructuredPath)
  }

  if (invocation.toolName === 'run_terminal') {
    const commandText = readFirstText([parsedArguments?.command, parsedArguments?.cmd])
    return commandText ? truncateDisplayText(commandText, MAX_TERMINAL_COMMAND_LABEL_LENGTH) : null
  }

  const absolutePath = getAbsolutePath(invocation)
  if (!absolutePath) {
    return null
  }

  if (invocation.toolName === 'list' || invocation.toolName === 'glob' || invocation.toolName === 'grep') {
    return workspaceRootPath ? getRelativeDisplayPath(workspaceRootPath, absolutePath) : absolutePath
  }

  return getBasename(absolutePath)
}

export function getToolInvocationHeaderLabel(
  invocation: ToolInvocationTrace,
  overrideState?: ToolInvocationTrace['state'],
  workspaceRootPath?: string | null,
) {
  const effectiveInvocation =
    overrideState === undefined
      ? invocation
      : {
          ...invocation,
          state: overrideState,
        }
  const target = getToolTarget(invocation, workspaceRootPath)
  return target ? `${getToolVerb(effectiveInvocation)} ${target}` : getToolVerb(effectiveInvocation)
}
