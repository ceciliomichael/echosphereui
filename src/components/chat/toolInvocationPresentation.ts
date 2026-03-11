import type { ToolInvocationTrace } from '../../types/chat'

interface ToolArgumentsValue {
  absolute_path?: unknown
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
  if (typeof argumentsValue?.absolute_path === 'string' && argumentsValue.absolute_path.trim().length > 0) {
    return argumentsValue.absolute_path.trim()
  }

  return extractPartialAbsolutePath(invocation.argumentsText)
}

function getBasename(absolutePath: string) {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  return pathSegments[pathSegments.length - 1] ?? absolutePath
}

function getToolVerb(invocation: ToolInvocationTrace) {
  if (invocation.toolName === 'list') {
    return invocation.state === 'running' ? 'Listing' : invocation.state === 'completed' ? 'Listed' : 'List failed'
  }

  if (invocation.toolName === 'read') {
    return invocation.state === 'running' ? 'Reading' : invocation.state === 'completed' ? 'Read' : 'Read failed'
  }

  if (invocation.toolName === 'write') {
    return invocation.state === 'running' ? 'Creating' : invocation.state === 'completed' ? 'Created' : 'Create failed'
  }

  if (invocation.toolName === 'edit') {
    return invocation.state === 'running' ? 'Editing' : invocation.state === 'completed' ? 'Edited' : 'Edit failed'
  }

  return invocation.state === 'running'
    ? `Running ${invocation.toolName}`
    : invocation.state === 'completed'
      ? `Completed ${invocation.toolName}`
      : `Failed ${invocation.toolName}`
}

function getToolTarget(invocation: ToolInvocationTrace) {
  const absolutePath = getAbsolutePath(invocation)
  if (!absolutePath) {
    return null
  }

  if (invocation.toolName === 'list') {
    return absolutePath
  }

  return getBasename(absolutePath)
}

export function getToolInvocationHeaderLabel(
  invocation: ToolInvocationTrace,
  overrideState?: ToolInvocationTrace['state'],
) {
  const effectiveInvocation =
    overrideState === undefined
      ? invocation
      : {
          ...invocation,
          state: overrideState,
        }
  const target = getToolTarget(invocation)
  return target ? `${getToolVerb(effectiveInvocation)} ${target}` : getToolVerb(effectiveInvocation)
}
