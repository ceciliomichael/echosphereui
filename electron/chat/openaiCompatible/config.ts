import type { ApiKeyProviderId } from '../../../src/types/chat'
import { readStoredApiKeyProviders } from '../../providers/store'

export interface OpenAICompatibleProviderConfig {
  apiKey: string
  baseUrl: string
}

const OPENAI_COMPATIBLE_PROVIDER_ID: ApiKeyProviderId = 'openai-compatible'

export async function readOpenAICompatibleProviderConfig(): Promise<OpenAICompatibleProviderConfig> {
  const providers = await readStoredApiKeyProviders()
  const provider = providers[OPENAI_COMPATIBLE_PROVIDER_ID]
  const baseUrl = provider?.base_url?.trim() ?? ''

  if (!baseUrl) {
    throw new Error('Configure an OpenAI-compatible base URL before using this provider.')
  }

  return {
    apiKey: provider?.api_key?.trim() ?? '',
    baseUrl,
  }
}
