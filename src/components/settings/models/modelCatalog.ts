import type { ModelCatalogItem, ProviderSectionDefinition } from './modelTypes'

export const PROVIDER_SECTIONS: readonly ProviderSectionDefinition[] = [
  {
    description: 'OAuth account connection for Codex sessions.',
    id: 'codex',
    label: 'Codex',
  },
  {
    description: 'OpenAI API key provider.',
    id: 'openai',
    label: 'OpenAI',
  },
  {
    description: 'Anthropic API key provider.',
    id: 'anthropic',
    label: 'Anthropic',
  },
  {
    description: 'Google API key provider.',
    id: 'google',
    label: 'Google',
  },
  {
    description: 'Custom OpenAI-compatible endpoint.',
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
  },
] as const

export const MODEL_CATALOG: readonly ModelCatalogItem[] = [
  { enabledByDefault: true, id: 'codex-composer-1', label: 'Composer 1', providerId: 'codex' },
  { enabledByDefault: true, id: 'codex-gpt-5.1-max-xhigh-fast', label: 'GPT-5.1 Codex Max Extra High Fast', providerId: 'codex' },
  { enabledByDefault: false, id: 'codex-gpt-5.1-max', label: 'GPT-5.1 Codex Max', providerId: 'codex' },
  { enabledByDefault: false, id: 'codex-gpt-5.1-max-high-fast', label: 'GPT-5.1 Codex Max High Fast', providerId: 'codex' },
  { enabledByDefault: false, id: 'codex-gpt-5.1-max-medium-fast', label: 'GPT-5.1 Codex Max Medium Fast', providerId: 'codex' },
  { enabledByDefault: true, id: 'openai-gpt-5.2', label: 'GPT-5.2', providerId: 'openai' },
  { enabledByDefault: true, id: 'openai-gpt-5.1-high', label: 'GPT-5.1 High', providerId: 'openai' },
  { enabledByDefault: false, id: 'openai-gpt-5.1-codex-max-high', label: 'GPT-5.1 Codex Max High', providerId: 'openai' },
  { enabledByDefault: false, id: 'openai-gpt-5.1-codex-max-low', label: 'GPT-5.1 Codex Max Low', providerId: 'openai' },
  { enabledByDefault: true, id: 'anthropic-opus-4.5', label: 'Opus 4.5', providerId: 'anthropic' },
  { enabledByDefault: true, id: 'anthropic-sonnet-4.5', label: 'Sonnet 4.5', providerId: 'anthropic' },
  { enabledByDefault: false, id: 'anthropic-sonnet-4.5-thinking', label: 'Sonnet 4.5 Thinking', providerId: 'anthropic' },
  { enabledByDefault: true, id: 'google-gemini-2.5-flash', label: 'Gemini 2.5 Flash', providerId: 'google' },
  { enabledByDefault: false, id: 'google-gemini-2.5-pro', label: 'Gemini 2.5 Pro', providerId: 'google' },
  { enabledByDefault: true, id: 'openai-compatible-grok-code', label: 'Grok Code', providerId: 'openai-compatible' },
  { enabledByDefault: false, id: 'openai-compatible-custom-fast', label: 'Custom Fast', providerId: 'openai-compatible' },
] as const
