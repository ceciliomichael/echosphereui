import { createOpenAICompatibleClient } from '../../../chat/openaiCompatible/client'
import { readOpenAICompatibleProviderConfig } from '../../../chat/openaiCompatible/config'
import { mapModelIdsToProviderConfigs } from '../shared'
import type { ProviderModelConfig } from '../../../../src/types/chat'

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

  return mapModelIdsToProviderConfigs('openai-compatible', Array.from(modelIds))
}
