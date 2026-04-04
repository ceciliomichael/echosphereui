import type { ReasoningEffort } from '../../../src/types/chat'

export function buildCodexProviderOptions(input: {
  reasoningEffort: ReasoningEffort
  system?: string
}) {
  return {
    openai: {
      forceReasoning: true,
      instructions: input.system,
      reasoningEffort: input.reasoningEffort,
      reasoningSummary: 'auto',
      store: false,
    },
  } as const
}
