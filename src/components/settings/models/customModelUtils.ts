import type { CustomModelConfig } from '../../../types/chat'
import type { ModelCatalogItem } from './modelTypes'

export function toCustomModelCatalogItems(customModels: readonly CustomModelConfig[]): ModelCatalogItem[] {
  return customModels.map((model) => ({
    apiModelId: model.apiModelId,
    enabledByDefault: true,
    id: model.id,
    isCustom: true,
    label: model.label,
    providerId: model.providerId,
    reasoningCapable: model.reasoningCapable,
  }))
}
