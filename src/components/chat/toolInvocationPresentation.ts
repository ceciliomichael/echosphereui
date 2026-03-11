import type { ToolInvocationTrace } from '../../types/chat'

interface ToolArgumentsValue {
  absolute_path?: unknown
}

function parseToolArguments(argumentsText: string): ToolArgumentsValue | null {
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

function getAbsolutePath(invocation: ToolInvocationTrace) {
  const argumentsValue = parseToolArguments(invocation.argumentsText)
  return typeof argumentsValue?.absolute_path === 'string' && argumentsValue.absolute_path.trim().length > 0
    ? argumentsValue.absolute_path.trim()
    : null
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
    return invocation.state === 'running' ? 'Writing' : invocation.state === 'completed' ? 'Wrote' : 'Write failed'
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

export function getToolInvocationHeaderLabel(invocation: ToolInvocationTrace) {
  const target = getToolTarget(invocation)
  return target ? `${getToolVerb(invocation)} ${target}` : getToolVerb(invocation)
}
