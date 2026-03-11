import type { ModelCatalogItem, ModelProviderId } from './modelTypes'

type ProviderModelDefinition = Pick<
  ModelCatalogItem,
  'apiModelId' | 'enabledByDefault' | 'id' | 'label' | 'reasoningCapable'
>

export const PROVIDER_MODELS = {
  codex: [
    { enabledByDefault: true, id: 'gpt-5.4', label: 'gpt-5.4', reasoningCapable: true },
    { enabledByDefault: true, id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', reasoningCapable: true },
    { enabledByDefault: false, id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', reasoningCapable: true },
    { enabledByDefault: false, id: 'gpt-5.2', label: 'gpt-5.2', reasoningCapable: true },
    { enabledByDefault: false, id: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max', reasoningCapable: true },
    { enabledByDefault: false, id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini', reasoningCapable: true },
  ],
  openai: [
    { apiModelId: 'gpt-5.4', enabledByDefault: true, id: 'openai:gpt-5.4', label: 'gpt-5.4', reasoningCapable: true },
    {
      apiModelId: 'gpt-5.4-pro',
      enabledByDefault: true,
      id: 'openai:gpt-5.4-pro',
      label: 'gpt-5.4-pro',
      reasoningCapable: true,
    },
    { apiModelId: 'gpt-5.2', enabledByDefault: true, id: 'openai:gpt-5.2', label: 'gpt-5.2', reasoningCapable: true },
    { apiModelId: 'gpt-5.1', enabledByDefault: true, id: 'openai:gpt-5.1', label: 'gpt-5.1', reasoningCapable: true },
    {
      apiModelId: 'gpt-5.3-codex',
      enabledByDefault: true,
      id: 'openai:gpt-5.3-codex',
      label: 'gpt-5.3-codex',
      reasoningCapable: true,
    },
  ],
  anthropic: [
    { enabledByDefault: true, id: 'anthropic-opus-4.5', label: 'anthropic-opus-4.5' },
    { enabledByDefault: true, id: 'anthropic-sonnet-4.5', label: 'anthropic-sonnet-4.5' },
    { enabledByDefault: false, id: 'anthropic-sonnet-4.5-thinking', label: 'anthropic-sonnet-4.5-thinking' },
  ],
  google: [
    { enabledByDefault: true, id: 'google-gemini-2.5-flash', label: 'google-gemini-2.5-flash' },
    { enabledByDefault: false, id: 'google-gemini-2.5-pro', label: 'google-gemini-2.5-pro' },
  ],
  'openai-compatible': [],
} as const satisfies Record<ModelProviderId, readonly ProviderModelDefinition[]>
