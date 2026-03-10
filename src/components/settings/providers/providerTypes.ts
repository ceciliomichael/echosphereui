import type { ApiKeyProviderId } from '../../../types/chat'

export interface ApiKeyProviderDraft {
  apiKey: string
  baseUrl: string
  maxTokens: string
  temperature: string
}

export type ApiKeyProviderDraftMap = Record<ApiKeyProviderId, ApiKeyProviderDraft>
