import type { ChatMode } from '../../../src/types/chat'
import { buildAgentPrompt } from './agent/prompt'

interface BuildSystemPromptInput {
  agentContextRootPath: string
  chatMode: ChatMode
  supportsNativeTools: boolean
}

export function buildSystemPrompt(input: BuildSystemPromptInput) {
  return buildAgentPrompt(input)
}
