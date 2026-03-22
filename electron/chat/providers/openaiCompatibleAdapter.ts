import type { ChatProviderAdapter } from '../providerTypes'
import { streamOpenAICompatibleResponseWithTools } from '../openaiCompatible/runtime'
import { streamOpenAICompatibleResponsesWithTools } from '../openaiCompatible/runtimeResponses'
import { buildOpenAIClient, loadOpenAIProviderConfig } from './openaiShared'
import { shouldFallbackToChatCompletions } from './openaiCompatibleTransportFallback'
import { setKnownOpenAICompatibleTransportMode, type OpenAICompatibleTransportMode } from './openaiCompatibleTransportState'

const transportModeByBaseUrl = new Map<string, OpenAICompatibleTransportMode>()

function normalizeTransportCacheKey(baseUrl: string) {
  return baseUrl.trim().toLowerCase()
}

export const openaiCompatibleChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'openai-compatible',
  async streamResponse(request, context) {
    const providerConfig = await loadOpenAIProviderConfig('openai-compatible')
    const client = buildOpenAIClient(providerConfig)
    const transportCacheKey = normalizeTransportCacheKey(providerConfig.baseURL)
    const cachedTransportMode = transportModeByBaseUrl.get(transportCacheKey)

    try {
      if (cachedTransportMode === 'chat-completions') {
        setKnownOpenAICompatibleTransportMode('chat-completions')
        await streamOpenAICompatibleResponseWithTools(
          client,
          {
            agentContextRootPath: request.agentContextRootPath,
            chatMode: request.chatMode,
            messages: request.messages,
            modelId: request.modelId,
            providerId: request.providerId,
            reasoningEffort: request.reasoningEffort,
            terminalExecutionMode: request.terminalExecutionMode,
          },
          context,
        )
        return
      }

      setKnownOpenAICompatibleTransportMode('responses')
      await streamOpenAICompatibleResponsesWithTools(
        client,
        {
          agentContextRootPath: request.agentContextRootPath,
          chatMode: request.chatMode,
          messages: request.messages,
          modelId: request.modelId,
          providerId: request.providerId,
          reasoningEffort: request.reasoningEffort,
          terminalExecutionMode: request.terminalExecutionMode,
        },
        context,
      )
      transportModeByBaseUrl.set(transportCacheKey, 'responses')
      setKnownOpenAICompatibleTransportMode('responses')
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      if (cachedTransportMode !== 'chat-completions' && shouldFallbackToChatCompletions(error)) {
        transportModeByBaseUrl.set(transportCacheKey, 'chat-completions')
        setKnownOpenAICompatibleTransportMode('chat-completions')
        await streamOpenAICompatibleResponseWithTools(
          client,
          {
            agentContextRootPath: request.agentContextRootPath,
            chatMode: request.chatMode,
            messages: request.messages,
            modelId: request.modelId,
            providerId: request.providerId,
            reasoningEffort: request.reasoningEffort,
            terminalExecutionMode: request.terminalExecutionMode,
          },
          context,
        )
        return
      }

      throw error
    }
  },
}
