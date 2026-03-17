import type { ProviderModelConfig } from '../../../types/chat'
import type { ModelCatalogItem } from './modelTypes'

function isProviderModelEnabledByDefault(model: ProviderModelConfig) {
  if (model.providerId === 'mistral') {
    return false
  }

  return true
}

export function toProviderModelCatalogItems(providerModels: readonly ProviderModelConfig[]): ModelCatalogItem[] {
  return providerModels.map((model) => ({
    apiModelId: model.apiModelId,
    enabledByDefault: isProviderModelEnabledByDefault(model),
    id: model.id,
    label: model.label,
    providerId: model.providerId,
    reasoningCapable: model.reasoningCapable,
  }))
}
