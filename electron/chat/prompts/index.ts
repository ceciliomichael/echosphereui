import type { AppTerminalExecutionMode, ChatMode, ChatProviderId } from '../../../src/types/chat'
import { buildAgentPrompt } from './agent/prompt'
import { buildPlanPrompt } from './plan/prompt'
import { buildSharedAgentsInstructions } from './shared/agentsInstructions'
import { buildWorkspaceFileTree } from './shared/workspaceFileTree'

interface BuildSystemPromptInput {
  agentContextRootPath: string
  chatMode: ChatMode
  providerId?: ChatProviderId
  supportsNativeTools: boolean
  terminalExecutionMode?: AppTerminalExecutionMode
}

export async function buildSystemPrompt(input: BuildSystemPromptInput) {
  const [workspaceFileTree, sharedAgentsInstructions] = await Promise.all([
    buildWorkspaceFileTree(input.agentContextRootPath),
    input.chatMode === 'agent'
      ? buildSharedAgentsInstructions({
          agentContextRootPath: input.agentContextRootPath,
        })
      : Promise.resolve(null),
  ])
  const builtInPrompt =
    input.chatMode === 'plan'
      ? buildPlanPrompt({
          ...input,
          workspaceFileTree,
        })
      : buildAgentPrompt({
          ...input,
          workspaceFileTree,
        })

  if (!sharedAgentsInstructions) {
    return builtInPrompt
  }

  return [builtInPrompt, sharedAgentsInstructions].join('\n\n')
}
