import type { ModelCatalogItem, ProviderSectionDefinition } from './modelTypes'
import { PROVIDER_MODELS } from './providerModels'

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
    description: 'Mistral AI API key provider.',
    id: 'mistral',
    label: 'Mistral AI',
  },
  {
    description: 'Custom OpenAI-compatible endpoint.',
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
  },
] as const

function buildModelCatalog(): ModelCatalogItem[] {
  return PROVIDER_SECTIONS.flatMap((provider) =>
    PROVIDER_MODELS[provider.id].map((model) => ({
      ...model,
      providerId: provider.id,
    })),
  )
}

export const MODEL_CATALOG: readonly ModelCatalogItem[] = buildModelCatalog()
