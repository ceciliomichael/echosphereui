import type { ChatMode } from '../../../src/types/chat'
import { buildAgentPrompt } from './agent/prompt'
import { buildSharedAgentsInstructions } from './shared/agentsInstructions'

interface BuildSystemPromptInput {
  agentContextRootPath: string
  chatMode: ChatMode
  supportsNativeTools: boolean
}

export async function buildSystemPrompt(input: BuildSystemPromptInput) {
  const builtInPrompt = buildAgentPrompt(input)
  const sharedAgentsInstructions = await buildSharedAgentsInstructions({
    agentContextRootPath: input.agentContextRootPath,
  })

  if (!sharedAgentsInstructions) {
    return builtInPrompt
  }

  return [builtInPrompt, sharedAgentsInstructions].join('\n\n')
}
