import { useEffect, useMemo, useState } from 'react'
import { MODEL_CATALOG, PROVIDER_SECTIONS } from '../components/settings/models/modelCatalog'
import { toCustomModelCatalogItems } from '../components/settings/models/customModelUtils'
import { readStoredModelToggleState } from '../components/settings/models/modelStorage'
import { isProviderConfigured } from '../components/settings/models/modelViewUtils'
import type { ChatProviderId, CustomModelConfig, ProvidersState, ReasoningEffort } from '../types/chat'

const SELECTED_MODEL_STORAGE_KEY = 'echosphere:chat:selected-model'
const LEGACY_SELECTED_CODEX_MODEL_STORAGE_KEY = 'echosphere:chat:codex:model'
const REASONING_EFFORT_STORAGE_KEY = 'echosphere:chat:reasoning-effort'

const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

interface ChatModelOption {
  id: string
  label: string
  providerId: ChatProviderId
  providerLabel: string
  reasoningCapable: boolean
  runtimeModelId: string
}

function readStoredStringValue(storageKey: string) {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    const value = window.localStorage.getItem(storageKey)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

function readStoredReasoningEffort(): ReasoningEffort {
  const storedValue = readStoredStringValue(REASONING_EFFORT_STORAGE_KEY)
  if (REASONING_EFFORT_VALUES.includes(storedValue as ReasoningEffort)) {
    return storedValue as ReasoningEffort
  }

  return 'medium'
}

function buildChatModelOptions(
  providersState: ProvidersState | null,
  customModels: readonly CustomModelConfig[],
): ChatModelOption[] {
  const modelToggleState = readStoredModelToggleState()
  const modelCatalog = [...MODEL_CATALOG, ...toCustomModelCatalogItems(customModels)]

  return PROVIDER_SECTIONS.flatMap((provider) => {
    if (!isProviderConfigured(provider.id, providersState)) {
      return []
    }

    const providerModels = modelCatalog.filter((model) => model.providerId === provider.id)
    const enabledProviderModels = providerModels.filter(
      (model) => modelToggleState[model.id] ?? model.enabledByDefault,
    )
    const sourceModels = enabledProviderModels.length > 0 ? enabledProviderModels : providerModels

    return sourceModels.map((model) => ({
      id: model.id,
      label: model.label,
      providerId: provider.id,
      providerLabel: provider.label,
      reasoningCapable: model.reasoningCapable ?? false,
      runtimeModelId: model.apiModelId ?? model.id,
    }))
  })
}

export function useChatRuntimeConfig(providersState: ProvidersState | null) {
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([])
  const modelOptions = useMemo(() => buildChatModelOptions(providersState, customModels), [customModels, providersState])
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const storedModelId = readStoredStringValue(SELECTED_MODEL_STORAGE_KEY)
    if (storedModelId.trim().length > 0) {
      return storedModelId
    }

    return readStoredStringValue(LEGACY_SELECTED_CODEX_MODEL_STORAGE_KEY)
  })
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => readStoredReasoningEffort())

  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.id === selectedModelId) ?? modelOptions[0] ?? null,
    [modelOptions, selectedModelId],
  )

  useEffect(() => {
    let isMounted = true

    void window.echosphereModels
      .listCustomModels()
      .then((nextModels) => {
        if (!isMounted) {
          return
        }

        setCustomModels(nextModels)
      })
      .catch((error) => {
        console.error('Failed to load custom models for chat runtime', error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (selectedModel?.id !== selectedModelId) {
      setSelectedModelId(selectedModel?.id ?? '')
    }
  }, [selectedModel, selectedModelId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      if (selectedModelId.trim().length > 0) {
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModelId)
        return
      }

      window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY)
    } catch {
      // Ignore storage write failures.
    }
  }, [selectedModelId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(REASONING_EFFORT_STORAGE_KEY, reasoningEffort)
    } catch {
      // Ignore storage write failures.
    }
  }, [reasoningEffort])

  return {
    hasConfiguredProvider: modelOptions.length > 0,
    modelOptions,
    providerId: selectedModel?.providerId ?? null,
    providerLabel: selectedModel?.providerLabel ?? null,
    reasoningEffort,
    selectedModelId: selectedModel?.id ?? '',
    selectedRuntimeModelId: selectedModel?.runtimeModelId ?? '',
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector: Boolean(selectedModel?.reasoningCapable),
  }
}
