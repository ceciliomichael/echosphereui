import type { ApiKeyProviderId } from '../../../types/chat'

export interface ApiKeyProviderSchema {
  apiKeyOptional: boolean
  baseUrlLabel: string
  baseUrlRequired: boolean
  defaultBaseUrl: string
  description: string
  id: ApiKeyProviderId
  label: string
  showAdvancedDefaults: boolean
  showBaseUrl: boolean
}

export const API_KEY_PROVIDER_SCHEMAS: readonly ApiKeyProviderSchema[] = [
  {
    apiKeyOptional: false,
    baseUrlLabel: 'Base URL',
    baseUrlRequired: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    description: 'Connect to OpenAI using your API key.',
    id: 'openai',
    label: 'OpenAI',
    showAdvancedDefaults: true,
    showBaseUrl: true,
  },
  {
    apiKeyOptional: false,
    baseUrlLabel: 'Base URL',
    baseUrlRequired: false,
    defaultBaseUrl: 'https://api.anthropic.com',
    description: 'Connect to Anthropic Claude using your API key. You can override the default API base URL if needed.',
    id: 'anthropic',
    label: 'Anthropic',
    showAdvancedDefaults: true,
    showBaseUrl: true,
  },
  {
    apiKeyOptional: false,
    baseUrlLabel: 'Base URL',
    baseUrlRequired: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    description: 'Connect to Google Gemini using your API key.',
    id: 'google',
    label: 'Google',
    showAdvancedDefaults: true,
    showBaseUrl: false,
  },
  {
    apiKeyOptional: false,
    baseUrlLabel: 'Base URL',
    baseUrlRequired: false,
    defaultBaseUrl: 'https://api.mistral.ai',
    description: 'Connect to Mistral AI using your API key.',
    id: 'mistral',
    label: 'Mistral AI',
    showAdvancedDefaults: true,
    showBaseUrl: true,
  },
  {
    apiKeyOptional: true,
    baseUrlLabel: 'Base URL',
    baseUrlRequired: true,
    defaultBaseUrl: 'https://your-provider.example.com/v1',
    description: 'Connect to any OpenAI-compatible endpoint. API key is optional.',
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    showAdvancedDefaults: true,
    showBaseUrl: true,
  },
] as const

export function getApiKeyProviderSchema(providerId: ApiKeyProviderId) {
  return API_KEY_PROVIDER_SCHEMAS.find((schema) => schema.id === providerId)
}
