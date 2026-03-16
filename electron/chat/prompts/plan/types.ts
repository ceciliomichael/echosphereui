import type { AppTerminalExecutionMode, ChatMode, ChatProviderId } from '../../../../src/types/chat'

export interface BuildPlanPromptInput {
  agentContextRootPath: string
  chatMode: ChatMode
  providerId?: ChatProviderId
  supportsNativeTools: boolean
  terminalExecutionMode?: AppTerminalExecutionMode
  workspaceFileTree?: string
}
