import { Mistral } from '@mistralai/mistralai'
import type { ModelList } from '@mistralai/mistralai/models/components'
import { readStoredApiKeyProviders } from '../../providers/store'

export const MISTRAL_DEFAULT_BASE_URL = 'https://api.mistral.ai'
export const MISTRAL_REQUEST_TIMEOUT_MS = 120_000

export interface MistralProviderConfig {
  apiKey: string
  baseURL: string
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function toMistralModelListData(modelList: ModelList) {
  return Array.isArray(modelList.data) ? modelList.data : []
}

function toBaseChatModelCards(modelList: ModelList) {
  return toMistralModelListData(modelList)
    .filter((model) => model.type === 'base')
    .filter((model) => model.capabilities.completionChat)
}

export function buildMistralClient(providerConfig: MistralProviderConfig) {
  return new Mistral({
    apiKey: providerConfig.apiKey,
    retryConfig: {
      strategy: 'backoff',
    },
    serverURL: providerConfig.baseURL,
    timeoutMs: MISTRAL_REQUEST_TIMEOUT_MS,
  })
}

export async function loadMistralProviderConfig(): Promise<MistralProviderConfig> {
  const storedProviders = await readStoredApiKeyProviders()
  const providerConfig = storedProviders.mistral
  const apiKey = providerConfig?.api_key?.trim() ?? ''
  const configuredBaseUrl = providerConfig?.base_url?.trim() ?? ''

  if (!apiKey) {
    throw new Error('Mistral AI is not configured. Save a Mistral API key in Settings > Providers before sending messages.')
  }

  return {
    apiKey,
    baseURL: configuredBaseUrl || MISTRAL_DEFAULT_BASE_URL,
  }
}

export async function listMistralChatModels(client: Mistral) {
  const response = await client.models.list()
  const modelCards = toBaseChatModelCards(response)
  const modelsByLabel = new Map<
    string,
    {
      apiModelId: string
      id: string
      label: string
      providerId: 'mistral'
      reasoningCapable: boolean
    }
  >()

  for (const model of modelCards) {
    const label = hasText(model.name) ? model.name : model.id
    const normalizedLabel = label.trim().toLowerCase()
    const nextModel = {
      apiModelId: model.id,
      id: `mistral:${model.id}`,
      label,
      providerId: 'mistral' as const,
      reasoningCapable: false,
    }
    const existingModel = modelsByLabel.get(normalizedLabel)

    if (!existingModel) {
      modelsByLabel.set(normalizedLabel, nextModel)
      continue
    }

    // Prefer canonical "latest" ids when duplicates share the same display name.
    if (!existingModel.apiModelId.endsWith('-latest') && nextModel.apiModelId.endsWith('-latest')) {
      modelsByLabel.set(normalizedLabel, nextModel)
    }
  }

  return Array.from(modelsByLabel.values()).sort((left, right) => left.label.localeCompare(right.label))
}
