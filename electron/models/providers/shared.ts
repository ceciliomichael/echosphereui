import type { ProviderModelConfig } from '../../../src/types/chat'
import type { ProviderModelDefinition } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function compareProviderModelLabels(left: ProviderModelConfig, right: ProviderModelConfig) {
  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
}

export function normalizeProviderModelConfig(
  providerId: ProviderModelConfig['providerId'],
  input: unknown,
): ProviderModelConfig | null {
  if (!isRecord(input)) {
    return null
  }

  const id = hasText(input.id) ? input.id.trim() : ''
  if (!id) {
    return null
  }

  const apiModelId = hasText(input.apiModelId) ? input.apiModelId.trim() : id
  const label = hasText(input.label) ? input.label.trim() : id
  const enabledByDefault = typeof input.enabledByDefault === 'boolean' ? input.enabledByDefault : true
  const reasoningCapable = typeof input.reasoningCapable === 'boolean' ? input.reasoningCapable : false

  return {
    apiModelId,
    enabledByDefault,
    id,
    label,
    providerId,
    reasoningCapable,
  }
}

export function normalizeProviderModelConfigs(
  providerId: ProviderModelConfig['providerId'],
  input: readonly unknown[],
): ProviderModelConfig[] {
  const configs = input
    .map((entry) => normalizeProviderModelConfig(providerId, entry))
    .filter((model): model is ProviderModelConfig => model !== null)

  return configs.sort(compareProviderModelLabels)
}

export function mapModelIdsToProviderConfigs(
  providerId: ProviderModelConfig['providerId'],
  modelIds: readonly string[],
): ProviderModelConfig[] {
  const configs = new Map<string, ProviderModelConfig>()

  for (const modelId of modelIds) {
    const trimmedModelId = modelId.trim()
    if (!trimmedModelId || configs.has(trimmedModelId)) {
      continue
    }

    configs.set(trimmedModelId, {
      apiModelId: trimmedModelId,
      enabledByDefault: true,
      id: trimmedModelId,
      label: trimmedModelId,
      providerId,
      reasoningCapable: false,
    })
  }

  return Array.from(configs.values()).sort(compareProviderModelLabels)
}

export function normalizeProviderModelDefinitions(
  providerId: ProviderModelConfig['providerId'],
  input: readonly ProviderModelDefinition[],
): ProviderModelConfig[] {
  return normalizeProviderModelConfigs(providerId, input)
}
