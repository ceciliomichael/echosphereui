import type { ApiKeyProviderId, ReasoningEffort } from '../../../types/chat'

export type ModelProviderId = 'codex' | ApiKeyProviderId

export interface ModelCatalogItem {
  apiModelId?: string
  enabledByDefault: boolean
  id: string
  isCustom?: boolean
  label: string
  providerId: ModelProviderId
  reasoningCapable?: boolean
  reasoningEfforts?: readonly ReasoningEffort[]
}

export interface ProviderSectionDefinition {
  description: string
  id: ModelProviderId
  label: string
}

export type ModelToggleState = Record<string, boolean>
