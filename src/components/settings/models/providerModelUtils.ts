import type { ProviderModelConfig } from '../../../types/chat'
import type { ModelCatalogItem } from './modelTypes'

export function toProviderModelCatalogItems(providerModels: readonly ProviderModelConfig[]): ModelCatalogItem[] {
  return providerModels.map((model) => ({
    apiModelId: model.apiModelId,
    enabledByDefault: model.enabledByDefault,
    id: model.id,
    label: model.label,
    providerId: model.providerId,
    reasoningCapable: model.reasoningCapable,
  }))
}
