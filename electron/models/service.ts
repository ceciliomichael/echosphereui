import type { ChatProviderId, SaveCustomModelInput } from '../../src/types/chat'
import { listProviderModels as listConfiguredProviderModels } from './providers'
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

export async function listProviderModels(providerId: ChatProviderId) {
  return listConfiguredProviderModels(providerId)
}
