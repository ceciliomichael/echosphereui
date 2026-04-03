import type { ApiKeyProviderId, SaveCustomModelInput } from '../../src/types/chat'
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
  void providerId
  return []
}
