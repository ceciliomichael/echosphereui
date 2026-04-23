import type { ChatProviderId, ProviderModelConfig } from '../../../src/types/chat'
import { listCodexModels } from './codex/models'
import { listOpenAICompatibleModels } from './openaiCompatible/models'

export async function listProviderModels(providerId: ChatProviderId): Promise<ProviderModelConfig[]> {
  if (providerId === 'codex') {
    return listCodexModels()
  }

  if (providerId === 'openai-compatible') {
    return listOpenAICompatibleModels()
  }

  return []
}
