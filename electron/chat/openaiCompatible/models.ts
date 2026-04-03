import type { ProviderModelConfig } from '../../../src/types/chat'
import { createOpenAICompatibleClient } from './client'
import { readOpenAICompatibleProviderConfig } from './config'

function compareModelLabels(left: ProviderModelConfig, right: ProviderModelConfig) {
  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
}

function toProviderModelConfig(modelId: string): ProviderModelConfig {
  return {
    apiModelId: modelId,
    id: `openai-compatible:${modelId}`,
    label: modelId,
    providerId: 'openai-compatible',
    reasoningCapable: false,
  }
}

export async function listOpenAICompatibleModels(): Promise<ProviderModelConfig[]> {
  const providerConfig = await readOpenAICompatibleProviderConfig()
  const client = createOpenAICompatibleClient(providerConfig)
  const modelPage = await client.models.list()
  const modelIds = new Set<string>()

  for (const entry of modelPage.data) {
    if (typeof entry.id !== 'string') {
      continue
    }

    const modelId = entry.id.trim()
    if (!modelId) {
      continue
    }

    modelIds.add(modelId)
  }

  return Array.from(modelIds).map(toProviderModelConfig).sort(compareModelLabels)
}
