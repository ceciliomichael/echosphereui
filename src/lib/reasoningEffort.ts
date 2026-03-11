import type { ReasoningEffort } from '../types/chat'

export const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && REASONING_EFFORT_VALUES.includes(value as ReasoningEffort)
}
