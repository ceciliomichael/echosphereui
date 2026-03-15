import { buildAgentIdentitySection } from './sections/identity'
import type { BuildAgentPromptInput } from './types'

export function buildAgentPrompt(input: BuildAgentPromptInput) {
  if (input.chatMode !== 'agent') {
    return 'You are Echo, a helpful coding assistant.'
  }

  const sections = [buildAgentIdentitySection()]

  return ['<agent_mode>', ...sections, '</agent_mode>'].join('\n\n')
}
