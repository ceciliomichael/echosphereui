import {
  ANTHROPIC_REASONING_EFFORT_VALUES,
  GOOGLE_PRO_REASONING_EFFORT_VALUES,
  GOOGLE_REASONING_EFFORT_VALUES,
} from '../../../lib/reasoningEffort'
import type { ModelCatalogItem, ModelProviderId } from './modelTypes'

type ProviderModelDefinition = Pick<
  ModelCatalogItem,
  'apiModelId' | 'enabledByDefault' | 'id' | 'label' | 'reasoningCapable' | 'reasoningEfforts'
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
    {
      apiModelId: 'claude-sonnet-4-6',
      enabledByDefault: true,
      id: 'anthropic:claude-sonnet-4.6',
      label: 'claude-sonnet-4.6',
      reasoningCapable: true,
      reasoningEfforts: ANTHROPIC_REASONING_EFFORT_VALUES,
    },
    {
      apiModelId: 'claude-sonnet-4-5',
      enabledByDefault: true,
      id: 'anthropic:claude-sonnet-4.5',
      label: 'claude-sonnet-4.5',
    },
    {
      apiModelId: 'claude-opus-4-5',
      enabledByDefault: true,
      id: 'anthropic:claude-opus-4.5',
      label: 'claude-opus-4.5',
      reasoningCapable: true,
      reasoningEfforts: ANTHROPIC_REASONING_EFFORT_VALUES,
    },
    {
      apiModelId: 'claude-opus-4-6',
      enabledByDefault: true,
      id: 'anthropic:claude-opus-4.6',
      label: 'claude-opus-4.6',
      reasoningCapable: true,
      reasoningEfforts: ANTHROPIC_REASONING_EFFORT_VALUES,
    },
    {
      apiModelId: 'claude-haiku-4-5',
      enabledByDefault: true,
      id: 'anthropic:claude-haiku-4.5',
      label: 'claude-haiku-4.5',
    },
  ],
  google: [
    {
      apiModelId: 'gemini-3.1-pro-preview',
      enabledByDefault: true,
      id: 'google-gemini-3.1-pro-preview',
      label: 'gemini-3.1-pro-preview',
      reasoningCapable: true,
      reasoningEfforts: GOOGLE_PRO_REASONING_EFFORT_VALUES,
    },
    {
      apiModelId: 'gemini-3-flash-preview',
      enabledByDefault: true,
      id: 'google-gemini-3-flash-preview',
      label: 'gemini-3-flash-preview',
      reasoningCapable: true,
      reasoningEfforts: GOOGLE_REASONING_EFFORT_VALUES,
    },
    {
      apiModelId: 'gemini-3.1-flash-lite-preview',
      enabledByDefault: true,
      id: 'google-gemini-3.1-flash-lite-preview',
      label: 'gemini-3.1-flash-lite-preview',
      reasoningCapable: true,
      reasoningEfforts: GOOGLE_REASONING_EFFORT_VALUES,
    },
  ],
  mistral: [],
  'openai-compatible': [],
} as const satisfies Record<ModelProviderId, readonly ProviderModelDefinition[]>
