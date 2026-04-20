import type { ToolInvocationTrace } from '../../types/chat'

export function canInterruptStreamForSteer(
  toolInvocations: readonly Pick<ToolInvocationTrace, 'state' | 'toolName'>[],
) {
  return !toolInvocations.some((invocation) => invocation.state === 'running')
}
