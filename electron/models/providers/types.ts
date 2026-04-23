import type { ChatProviderId } from '../../../src/types/chat'

export interface ProviderModelDefinition {
  apiModelId?: string
  enabledByDefault?: boolean
  id: string
  label?: string
  reasoningCapable?: boolean
}

export interface ProviderModelJsonSource {
  readonly models: readonly ProviderModelDefinition[]
}

export type ProviderModelSourceId = ChatProviderId
