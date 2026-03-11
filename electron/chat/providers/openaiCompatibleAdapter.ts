import type { ChatProviderAdapter } from '../providerTypes'
import { streamOpenAICompatibleResponseWithTools } from '../openaiCompatible/runtime'
import { buildOpenAIClient, loadOpenAIProviderConfig } from './openaiShared'

export const openaiCompatibleChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'openai-compatible',
  async streamResponse(request, context) {
    const providerConfig = await loadOpenAIProviderConfig('openai-compatible')
    const client = buildOpenAIClient(providerConfig)

    try {
      await streamOpenAICompatibleResponseWithTools(
        client,
        {
          agentContextRootPath: request.agentContextRootPath,
          chatMode: request.chatMode,
          messages: request.messages,
          modelId: request.modelId,
          reasoningEffort: request.reasoningEffort,
        },
        context,
      )
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      throw error
    }
  },
}
