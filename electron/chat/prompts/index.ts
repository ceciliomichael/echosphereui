import type { AppTerminalExecutionMode, ChatMode, ChatProviderId } from '../../../src/types/chat'
import { buildAgentPrompt } from './agent/prompt'
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
    buildSharedAgentsInstructions({
      agentContextRootPath: input.agentContextRootPath,
    }),
  ])
  const builtInPrompt = buildAgentPrompt({
    ...input,
    workspaceFileTree,
  })

  if (!sharedAgentsInstructions) {
    return builtInPrompt
  }

  return [builtInPrompt, sharedAgentsInstructions].join('\n\n')
}
