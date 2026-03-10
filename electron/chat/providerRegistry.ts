import type { ChatProviderId } from '../../src/types/chat'
import type { ChatProviderAdapter, ProviderStreamContext, ProviderStreamRequest } from './providerTypes'
import { codexChatProviderAdapter } from './providers/codexAdapter'

async function unsupportedProviderResponse(request: ProviderStreamRequest) {
  throw new Error(`Provider "${request.providerId}" is not implemented yet.`)
}

const unsupportedAdapter: ChatProviderAdapter = {
  providerId: 'openai',
  streamResponse: unsupportedProviderResponse,
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
  openai: unsupportedAdapter,
  'openai-compatible': {
    providerId: 'openai-compatible',
    streamResponse: unsupportedProviderResponse,
  },
}

export async function streamProviderResponse(request: ProviderStreamRequest, context: ProviderStreamContext) {
  return providerRegistry[request.providerId].streamResponse(request, context)
}
