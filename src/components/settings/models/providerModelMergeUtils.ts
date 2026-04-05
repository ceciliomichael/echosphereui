import type { ProviderModelConfig } from '../../../types/chat'

export function mergeProviderModels(
  existingModels: readonly ProviderModelConfig[],
  incomingModels: readonly ProviderModelConfig[],
): ProviderModelConfig[] {
  const seenModelIds = new Set(existingModels.map((model) => model.id))
  const mergedModels = [...existingModels]

  for (const model of incomingModels) {
    if (seenModelIds.has(model.id)) {
      continue
    }

    seenModelIds.add(model.id)
    mergedModels.push(model)
  }

  return mergedModels
}
