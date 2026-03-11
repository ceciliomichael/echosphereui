import { MODEL_CATALOG, PROVIDER_SECTIONS } from './modelCatalog'
import type { ModelCatalogItem, ModelProviderId, ProviderSectionDefinition } from './modelTypes'
import { toCustomModelCatalogItems } from './customModelUtils'
import type { CustomModelConfig, ProvidersState } from '../../../types/chat'

export interface ModelProviderSectionView {
  configured: boolean
  models: ModelCatalogItem[]
  provider: ProviderSectionDefinition
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

export function isProviderConfigured(providerId: ModelProviderId, providersState: ProvidersState | null) {
  if (!providersState) {
    return false
  }

  if (providerId === 'codex') {
    return providersState.codex.isAuthenticated
  }

  const providerStatus = providersState.apiKeyProviders.find((provider) => provider.id === providerId)
  return Boolean(providerStatus?.configured)
}

export function buildModelProviderSections(
  searchValue: string,
  providersState: ProvidersState | null,
  customModels: readonly CustomModelConfig[],
): ModelProviderSectionView[] {
  const normalizedSearch = normalizeSearchValue(searchValue)
  const modelCatalog = [...MODEL_CATALOG, ...toCustomModelCatalogItems(customModels)]
  const filteredModels =
    normalizedSearch.length === 0
      ? modelCatalog
      : modelCatalog.filter((model) => model.label.toLowerCase().includes(normalizedSearch))

  return PROVIDER_SECTIONS.map((provider) => ({
    configured: isProviderConfigured(provider.id, providersState),
    models: filteredModels.filter((model) => model.providerId === provider.id),
    provider,
  })).filter((section) => section.configured && section.models.length > 0)
}
