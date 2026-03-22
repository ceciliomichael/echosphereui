import { createHash } from 'node:crypto'
import type { AppTerminalExecutionMode, ChatMode, ChatProviderId } from '../../../src/types/chat'

interface BuildPromptCacheKeyInput {
  chatMode: ChatMode
  forceToolChoice?: 'none' | 'required'
  kind: 'chat-completions' | 'responses'
  modelId: string
  providerId?: ChatProviderId
  systemPrompt: string
  terminalExecutionMode?: AppTerminalExecutionMode
  toolDefinitions: readonly unknown[]
}

export function buildPromptCacheKey(input: BuildPromptCacheKeyInput) {
  const payload = JSON.stringify({
    chatMode: input.chatMode,
    forceToolChoice: input.forceToolChoice ?? null,
    kind: input.kind,
    modelId: input.modelId,
    providerId: input.providerId ?? null,
    systemPrompt: input.systemPrompt,
    terminalExecutionMode: input.terminalExecutionMode ?? null,
    toolDefinitions: input.toolDefinitions,
  })

  return `echosphere:${createHash('sha256').update(payload).digest('hex')}`
}
