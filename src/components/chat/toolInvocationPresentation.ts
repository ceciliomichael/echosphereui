import type { ToolInvocationTrace } from '../../types/chat'
import { getRelativeDisplayPath } from '../../lib/pathPresentation'
import { parseStructuredToolResultContent } from '../../lib/toolResultContent'

interface ToolArgumentsValue {
  absolute_path?: unknown
  patch?: unknown
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

function extractFirstPatchPath(patchText: string) {
  const normalizedPatch = patchText.replace(/\r\n/g, '\n')
  const patchPathMatch = normalizedPatch.match(/\*\*\* (?:Update|Add|Delete) File:\s*(.+)/u)
  if (!patchPathMatch) {
    return null
  }

  const patchPath = patchPathMatch[1]?.trim()
  return patchPath && patchPath.length > 0 ? patchPath : null
}

function extractFirstPatchAction(patchText: string): 'add' | 'delete' | 'update' | null {
  const normalizedPatch = patchText.replace(/\r\n/g, '\n')
  const patchActionMatch = normalizedPatch.match(/\*\*\* (Update|Add|Delete) File:\s*(.+)/u)
  if (!patchActionMatch) {
    return null
  }

  const patchAction = patchActionMatch[1]
  if (patchAction === 'Add') {
    return 'add'
  }
  if (patchAction === 'Update') {
    return 'update'
  }
  return 'delete'
}

function extractPatchPathFromRawText(input: string) {
  const directMatch = input.match(/\*\*\* (?:Update|Add|Delete) File:\s*([^\n\r"]+)/u)
  if (!directMatch) {
    return null
  }

  const patchPath = directMatch[1]?.trim()
  return patchPath && patchPath.length > 0 ? patchPath : null
}

function extractPatchActionFromRawText(input: string): 'add' | 'delete' | 'update' | null {
  const directMatch = input.match(/\*\*\* (Update|Add|Delete) File:\s*[^\n\r"]+/u)
  if (!directMatch) {
    return null
  }

  if (directMatch[1] === 'Add') {
    return 'add'
  }
  if (directMatch[1] === 'Update') {
    return 'update'
  }
  return 'delete'
}

function extractPartialPatchPath(argumentsText: string) {
  const patchMatch = argumentsText.match(/"patch"\s*:\s*"((?:\\.|[^"])*)/u)
  if (patchMatch) {
    const patchText = decodePartialJsonString(patchMatch[1])
    const patchPath = extractFirstPatchPath(patchText)
    if (patchPath) {
      return patchPath
    }
  }

  const decodedArguments = decodePartialJsonString(argumentsText)
  return extractPatchPathFromRawText(decodedArguments) ?? extractPatchPathFromRawText(argumentsText)
}

function extractPartialPatchAction(argumentsText: string): 'add' | 'delete' | 'update' | null {
  const patchMatch = argumentsText.match(/"patch"\s*:\s*"((?:\\.|[^"])*)/u)
  if (patchMatch) {
    const patchText = decodePartialJsonString(patchMatch[1])
    const patchAction = extractFirstPatchAction(patchText)
    if (patchAction) {
      return patchAction
    }
  }

  const decodedArguments = decodePartialJsonString(argumentsText)
  return extractPatchActionFromRawText(decodedArguments) ?? extractPatchActionFromRawText(argumentsText)
}

function getAbsolutePath(invocation: ToolInvocationTrace) {
  const argumentsValue = parseCompleteToolArguments(invocation.argumentsText)
  if (typeof argumentsValue?.absolute_path === 'string' && argumentsValue.absolute_path.trim().length > 0) {
    return argumentsValue.absolute_path.trim()
  }

  if (typeof argumentsValue?.patch === 'string' && argumentsValue.patch.trim().length > 0) {
    const patchPath = extractFirstPatchPath(argumentsValue.patch)
    if (patchPath) {
      return patchPath
    }
  }

  if (typeof argumentsValue?.workdir === 'string' && argumentsValue.workdir.trim().length > 0) {
    return argumentsValue.workdir.trim()
  }

  return extractPartialAbsolutePath(invocation.argumentsText) ?? extractPartialPatchPath(invocation.argumentsText)
}

function getBasename(absolutePath: string) {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  return pathSegments[pathSegments.length - 1] ?? absolutePath
}

function getPatchIntent(invocation: ToolInvocationTrace): 'editing' | 'writing' {
  const argumentsValue = parseCompleteToolArguments(invocation.argumentsText)
  if (typeof argumentsValue?.patch === 'string' && argumentsValue.patch.trim().length > 0) {
    const patchAction = extractFirstPatchAction(argumentsValue.patch)
    return patchAction === 'add' ? 'writing' : 'editing'
  }

  const partialPatchAction = extractPartialPatchAction(invocation.argumentsText)
  return partialPatchAction === 'add' ? 'writing' : 'editing'
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

  if (invocation.toolName === 'glob') {
    return invocation.state === 'running'
      ? 'Searching'
      : invocation.state === 'completed'
        ? 'Searched'
        : 'Search failed'
  }

  if (invocation.toolName === 'grep') {
    return invocation.state === 'running'
      ? 'Searching'
      : invocation.state === 'completed'
        ? 'Searched'
        : 'Search failed'
  }

  if (invocation.toolName === 'patch') {
    const patchIntent = getPatchIntent(invocation)
    if (invocation.state === 'running') {
      return patchIntent === 'writing' ? 'Writing' : 'Editing'
    }

    if (invocation.state === 'failed') {
      return patchIntent === 'writing' ? 'Write failed' : 'Edit failed'
    }

    if (operation === 'noop') {
      return 'Verified'
    }

    return patchIntent === 'writing' ? 'Wrote' : 'Edited'
  }

  if (invocation.toolName === 'write') {
    if (invocation.state === 'running') {
      return 'Writing'
    }

    if (invocation.state === 'failed') {
      return 'Write failed'
    }

    return addedPathCount !== null && addedPathCount > 0 ? 'Wrote' : 'Overwrote'
  }

  if (invocation.toolName === 'exec_command') {
    return invocation.state === 'running'
      ? 'Executing'
      : invocation.state === 'completed'
        ? 'Executed'
        : 'Execution failed'
  }

  if (invocation.toolName === 'write_stdin') {
    return invocation.state === 'running'
      ? 'Interacting'
      : invocation.state === 'completed'
        ? 'Updated session'
        : 'Session update failed'
  }

  return invocation.state === 'running'
    ? `Running ${invocation.toolName}`
    : invocation.state === 'completed'
      ? `Completed ${invocation.toolName}`
      : `Failed ${invocation.toolName}`
}

function getToolTarget(invocation: ToolInvocationTrace, workspaceRootPath?: string | null) {
  const parsedResult = invocation.resultContent ? parseStructuredToolResultContent(invocation.resultContent) : null
  const structuredPath = parsedResult?.metadata?.subject?.path
  if (typeof structuredPath === 'string' && structuredPath.trim().length > 0) {
    const normalizedStructuredPath = structuredPath.trim()
    if (invocation.toolName === 'patch' && normalizedStructuredPath === '.') {
      const absolutePath = getAbsolutePath(invocation)
      return absolutePath ? getBasename(absolutePath) : null
    }

    if (invocation.toolName === 'list' || invocation.toolName === 'glob' || invocation.toolName === 'grep') {
      return normalizedStructuredPath
    }

    if (invocation.toolName === 'exec_command') {
      return normalizedStructuredPath
    }

    return getBasename(normalizedStructuredPath)
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
