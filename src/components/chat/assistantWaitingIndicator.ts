import type { AssistantWaitingIndicatorVariant, ToolInvocationTrace } from '../../types/chat'

const APPLY_TOOL_NAMES = new Set(['apply', 'apply_patch'])

interface ResolveAssistantWaitingIndicatorVariantInput {
  hasVisibleAssistantText: boolean
  toolInvocations: readonly Pick<ToolInvocationTrace, 'toolName'>[]
  waitingIndicatorVariant: AssistantWaitingIndicatorVariant
}

export function resolveAssistantWaitingIndicatorVariant({
  hasVisibleAssistantText,
  toolInvocations,
  waitingIndicatorVariant,
}: ResolveAssistantWaitingIndicatorVariantInput): AssistantWaitingIndicatorVariant {
  if (waitingIndicatorVariant === 'rate_limit_retry' || hasVisibleAssistantText) {
    return waitingIndicatorVariant
  }

  const hasApplyToolInvocation = toolInvocations.some((invocation) => APPLY_TOOL_NAMES.has(invocation.toolName))
  const hasNonApplyToolInvocation = toolInvocations.some((invocation) => !APPLY_TOOL_NAMES.has(invocation.toolName))

  if (hasApplyToolInvocation && !hasNonApplyToolInvocation) {
    return 'splash'
  }

  return waitingIndicatorVariant
}
