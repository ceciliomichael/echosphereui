import type { ApiKeyProviderId } from '../../../types/chat'

export type ModelProviderId = 'codex' | ApiKeyProviderId

export interface ModelCatalogItem {
  enabledByDefault: boolean
  id: string
  label: string
  providerId: ModelProviderId
  reasoningCapable?: boolean
}

export interface ProviderSectionDefinition {
  description: string
  id: ModelProviderId
  label: string
}

export type ModelToggleState = Record<string, boolean>
