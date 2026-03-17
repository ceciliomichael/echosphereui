import type { ApiKeyProviderId, SaveCustomModelInput } from '../../src/types/chat'
import { buildMistralClient, listMistralChatModels, loadMistralProviderConfig } from '../chat/providers/mistralShared'
import { listStoredCustomModels, removeCustomModelConfig, saveCustomModelConfig } from './store'

export async function listCustomModels() {
  return listStoredCustomModels()
}

export async function saveCustomModel(input: SaveCustomModelInput) {
  return saveCustomModelConfig(input)
}

export async function removeCustomModel(modelId: string) {
  return removeCustomModelConfig(modelId)
}

export async function listProviderModels(providerId: ApiKeyProviderId) {
  if (providerId !== 'mistral') {
    return []
  }

  const providerConfig = await loadMistralProviderConfig()
  const client = buildMistralClient(providerConfig)
  return listMistralChatModels(client)
}
