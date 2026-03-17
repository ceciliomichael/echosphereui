import { Mistral } from '@mistralai/mistralai'
import type { ProviderModelConfig } from '../../../src/types/chat'
import { readStoredApiKeyProviders } from '../../providers/store'

export const MISTRAL_DEFAULT_BASE_URL = 'https://api.mistral.ai'
export const MISTRAL_REQUEST_TIMEOUT_MS = 120_000

export interface MistralProviderConfig {
  apiKey: string
  baseURL: string
}

const MISTRAL_MODEL_IDS = [
  'codestral-2508',
  'devstral-2512',
  'devstral-medium-2507',
  'devstral-small-2507',
  'labs-devstral-small-2512',
  'labs-leantral-2603',
  'labs-mistral-small-creative',
  'magistral-medium-2509',
  'magistral-small-2509',
  'minimal-14b-2512',
  'minimal-3b-2512',
  'minimal-8b-2512',
  'mistral-large-2411',
  'mistral-large-2512',
  'mistral-medium-2505',
  'mistral-small-2506',
  'mistral-small-2603',
  'open-mistral-nemo',
  'pixtral-large-2411',
  'voxtral-mini-2507',
] as const

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

export function listMistralCatalogModels(): ProviderModelConfig[] {
  return [...MISTRAL_MODEL_IDS]
    .sort((left, right) => left.localeCompare(right))
    .map((modelId) => ({
      apiModelId: modelId,
      id: `mistral:${modelId}`,
      label: modelId,
      providerId: 'mistral' as const,
      reasoningCapable: false,
    }))
}
