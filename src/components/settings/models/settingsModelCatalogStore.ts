import { useEffect, useSyncExternalStore } from 'react'
import { isProviderConfigured } from './modelViewUtils'
import type { CustomModelConfig, ProviderModelConfig, ProvidersState } from '../../../types/chat'

export interface SettingsModelCatalogState {
  customModels: CustomModelConfig[]
  customModelsErrorMessage: string | null
  customModelsHasLoaded: boolean
  customModelsLoading: boolean
  providerModels: ProviderModelConfig[]
  providerModelsErrorMessage: string | null
  providerModelsHasLoaded: boolean
  providerModelsLoading: boolean
}

const EMPTY_SETTINGS_MODEL_CATALOG_STATE: SettingsModelCatalogState = {
  customModels: [],
  customModelsErrorMessage: null,
  customModelsHasLoaded: false,
  customModelsLoading: false,
  providerModels: [],
  providerModelsErrorMessage: null,
  providerModelsHasLoaded: false,
  providerModelsLoading: false,
}

const subscribers = new Set<() => void>()
let state: SettingsModelCatalogState = EMPTY_SETTINGS_MODEL_CATALOG_STATE
let customModelsRequest: Promise<CustomModelConfig[]> | null = null
let providerModelsRequest: Promise<ProviderModelConfig[]> | null = null

function mergeCustomModels(
  existingModels: readonly CustomModelConfig[],
  incomingModels: readonly CustomModelConfig[],
): CustomModelConfig[] {
  const seenModelIds = new Set(existingModels.map((model) => model.id))
  const mergedModels = [...existingModels]

  for (const model of incomingModels) {
    if (seenModelIds.has(model.id)) {
      continue
    }

    seenModelIds.add(model.id)
    mergedModels.push(model)
  }

  return mergedModels.sort((left, right) => left.label.localeCompare(right.label))
}

function notifySubscribers() {
  for (const subscriber of subscribers) {
    subscriber()
  }
}

function updateState(nextState: SettingsModelCatalogState) {
  state = nextState
  notifySubscribers()
}

export function replaceCustomModels(customModels: readonly CustomModelConfig[]) {
  updateState({
    ...state,
    customModels: mergeCustomModels([], customModels),
    customModelsErrorMessage: null,
    customModelsHasLoaded: true,
    customModelsLoading: false,
  })
}

function getLoadErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    return message.length > 0 ? message : fallbackMessage
  }

  if (typeof error === 'string') {
    const message = error.trim()
    return message.length > 0 ? message : fallbackMessage
  }

  return fallbackMessage
}

async function loadCustomModels() {
  if (typeof window === 'undefined') {
    return state.customModels
  }

  if (state.customModelsHasLoaded) {
    return state.customModels
  }

  if (customModelsRequest) {
    return customModelsRequest
  }

  updateState({
    ...state,
    customModelsErrorMessage: null,
    customModelsLoading: true,
  })

  customModelsRequest = window.echosphereModels
    .listCustomModels()
    .then((models) => {
      updateState({
        ...state,
        customModels: mergeCustomModels(state.customModels, models),
        customModelsErrorMessage: null,
        customModelsHasLoaded: true,
        customModelsLoading: false,
      })
      return models
    })
    .catch((error) => {
      console.error('Failed to load custom models', error)
      updateState({
        ...state,
        customModelsErrorMessage: getLoadErrorMessage(error, 'Unable to load saved custom models.'),
        customModelsLoading: false,
      })
      return [] as CustomModelConfig[]
    })
    .finally(() => {
      customModelsRequest = null
    })

  return customModelsRequest
}

async function loadOpenAICompatibleModels() {
  if (typeof window === 'undefined') {
    return state.providerModels
  }

  if (state.providerModelsHasLoaded) {
    return state.providerModels
  }

  if (providerModelsRequest) {
    return providerModelsRequest
  }

  updateState({
    ...state,
    providerModelsErrorMessage: null,
    providerModelsLoading: true,
  })

  providerModelsRequest = window.echosphereModels
    .listProviderModels('openai-compatible')
    .then((models) => {
      updateState({
        ...state,
        providerModels: models,
        providerModelsErrorMessage: null,
        providerModelsHasLoaded: true,
        providerModelsLoading: false,
      })
      return models
    })
    .catch((error) => {
      console.error('Failed to load OpenAI-compatible models', error)
      updateState({
        ...state,
        providerModelsErrorMessage: getLoadErrorMessage(error, 'Unable to load provider models.'),
        providerModelsLoading: false,
      })
      return [] as ProviderModelConfig[]
    })
    .finally(() => {
      providerModelsRequest = null
    })

  return providerModelsRequest
}

export function getSettingsModelCatalogState() {
  return state
}

export function subscribeSettingsModelCatalog(listener: () => void) {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export async function preloadSettingsModelCatalog(providersState: ProvidersState | null) {
  const loadOperations: Promise<unknown>[] = [loadCustomModels()]

  if (isProviderConfigured('openai-compatible', providersState)) {
    loadOperations.push(loadOpenAICompatibleModels())
  }

  await Promise.allSettled(loadOperations)
}

export function useSettingsModelCatalog(providersState: ProvidersState | null) {
  const catalogState = useSyncExternalStore(
    subscribeSettingsModelCatalog,
    getSettingsModelCatalogState,
    getSettingsModelCatalogState,
  )

  useEffect(() => {
    void preloadSettingsModelCatalog(providersState)
  }, [providersState])

  return catalogState
}

export type SettingsModelCatalogStateSnapshot = ReturnType<typeof getSettingsModelCatalogState>
