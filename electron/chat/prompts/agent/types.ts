import type { ChatMode } from '../../../../src/types/chat'

export interface BuildAgentPromptInput {
  agentContextRootPath: string
  chatMode: ChatMode
  supportsNativeTools: boolean
}
