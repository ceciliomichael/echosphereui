import type { ChatProviderId } from '../../src/types/chat'
import type { ChatProviderAdapter, ProviderStreamContext, ProviderStreamRequest } from './providerTypes'
import { anthropicChatProviderAdapter } from './providers/anthropicAdapter'
import { codexChatProviderAdapter } from './providers/codexAdapter'
import { googleChatProviderAdapter } from './providers/googleAdapter'
import { openaiChatProviderAdapter } from './providers/openaiAdapter'
import { openaiCompatibleChatProviderAdapter } from './providers/openaiCompatibleAdapter'

const providerRegistry: Record<ChatProviderId, ChatProviderAdapter> = {
  anthropic: anthropicChatProviderAdapter,
  codex: codexChatProviderAdapter,
  google: googleChatProviderAdapter,
  openai: openaiChatProviderAdapter,
  'openai-compatible': openaiCompatibleChatProviderAdapter,
}

export async function streamProviderResponse(request: ProviderStreamRequest, context: ProviderStreamContext) {
  return providerRegistry[request.providerId].streamResponse(request, context)
}
