import type { ChatProviderAdapter } from '../providerTypes'
import { streamCodexResponsesWithTools } from './codexResponsesRuntime'

export const codexChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'codex',
  async streamResponse(request, context) {
    await streamCodexResponsesWithTools(request, context)
  },
}
