import type { ChatProviderAdapter } from '../providerTypes'
import { streamOpenAICompatibleResponseWithTools } from '../openaiCompatible/runtime'
import { streamOpenAICompatibleResponsesTurn } from '../openaiCompatible/runtimeResponses'
import { streamAgentLoopWithTools } from '../agentLoop/runtime'
import { buildOpenAIClient, loadOpenAIProviderConfig } from './openaiShared'
import { shouldFallbackToChatCompletions } from './openaiCompatibleTransportFallback'

type OpenAICompatibleTransportMode = 'chat-completions' | 'responses'

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

      await streamAgentLoopWithTools(
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
        (turnRequest, turnContext, options) =>
          streamOpenAICompatibleResponsesTurn(
            client,
            {
              agentContextRootPath: turnRequest.agentContextRootPath,
              chatMode: turnRequest.chatMode,
              forceToolChoice: turnRequest.forceToolChoice,
              messages: turnRequest.messages,
              modelId: turnRequest.modelId,
              providerId: request.providerId,
              reasoningEffort: turnRequest.reasoningEffort,
              terminalExecutionMode: request.terminalExecutionMode,
            },
            turnContext,
            options,
          ),
      )
      transportModeByBaseUrl.set(transportCacheKey, 'responses')
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      if (cachedTransportMode !== 'chat-completions' && shouldFallbackToChatCompletions(error)) {
        transportModeByBaseUrl.set(transportCacheKey, 'chat-completions')
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
