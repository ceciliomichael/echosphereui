import type { ChatProviderId } from '../../src/types/chat'
import type { ChatProviderAdapter, ProviderStreamContext, ProviderStreamRequest } from './providerTypes'
import { codexChatProviderAdapter } from './providers/codexAdapter'
import { openaiChatProviderAdapter, openaiCompatibleChatProviderAdapter } from './providers/openaiAdapter'

async function unsupportedProviderResponse(request: ProviderStreamRequest) {
  throw new Error(`Provider "${request.providerId}" is not implemented yet.`)
}

const providerRegistry: Record<ChatProviderId, ChatProviderAdapter> = {
  anthropic: {
    providerId: 'anthropic',
    streamResponse: unsupportedProviderResponse,
  },
  codex: codexChatProviderAdapter,
  google: {
    providerId: 'google',
    streamResponse: unsupportedProviderResponse,
  },
  openai: openaiChatProviderAdapter,
  'openai-compatible': openaiCompatibleChatProviderAdapter,
}

export async function streamProviderResponse(request: ProviderStreamRequest, context: ProviderStreamContext) {
  return providerRegistry[request.providerId].streamResponse(request, context)
}
