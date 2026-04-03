import { useCallback, useEffect, useMemo, useState } from 'react'
import { MODEL_CATALOG, PROVIDER_SECTIONS } from '../components/settings/models/modelCatalog'
import { toCustomModelCatalogItems } from '../components/settings/models/customModelUtils'
import { toProviderModelCatalogItems } from '../components/settings/models/providerModelUtils'
import { readStoredModelToggleState } from '../components/settings/models/modelStorage'
import { isProviderConfigured } from '../components/settings/models/modelViewUtils'
import {
  DEFAULT_REASONING_EFFORT_VALUES,
  normalizeReasoningEffort,
  OPENAI_COMPATIBLE_REASONING_EFFORT_VALUES,
} from '../lib/reasoningEffort'
import type {
  AppSettings,
  ChatProviderId,
  CustomModelConfig,
  ProviderModelConfig,
  ProvidersState,
  ReasoningEffort,
} from '../types/chat'

interface ChatModelOption {
  id: string
  label: string
  providerId: ChatProviderId
  providerLabel: string
  reasoningCapable: boolean
  reasoningEfforts?: readonly ReasoningEffort[]
  runtimeModelId: string
}

function buildChatModelOptions(
  providersState: ProvidersState | null,
  customModels: readonly CustomModelConfig[],
  providerModels: readonly ProviderModelConfig[],
): ChatModelOption[] {
  const modelToggleState = readStoredModelToggleState()
  const modelCatalog = [...MODEL_CATALOG, ...toProviderModelCatalogItems(providerModels), ...toCustomModelCatalogItems(customModels)]

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
      reasoningEfforts: model.reasoningEfforts,
      runtimeModelId: model.apiModelId ?? model.id,
    }))
  })
}

interface UseChatRuntimeConfigInput {
  isActiveScreen: boolean
  isProvidersLoading: boolean
  providersState: ProvidersState | null
  settings: Pick<AppSettings, 'chatModelId' | 'chatReasoningEffort'>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
}

function getDefaultReasoningEfforts(providerId: ChatProviderId) {
  if (providerId === 'openai-compatible') {
    return OPENAI_COMPATIBLE_REASONING_EFFORT_VALUES
  }

  return DEFAULT_REASONING_EFFORT_VALUES
}

export function useChatRuntimeConfig({
  isActiveScreen,
  isProvidersLoading,
  providersState,
  settings,
  updateSettings,
}: UseChatRuntimeConfigInput) {
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([])
  const [providerModels, setProviderModels] = useState<ProviderModelConfig[]>([])
  const [hasLoadedCustomModels, setHasLoadedCustomModels] = useState(false)
  const [hasLoadedOpenAICompatibleModels, setHasLoadedOpenAICompatibleModels] = useState(false)
  const modelOptions = useMemo(
    () => buildChatModelOptions(providersState, customModels, providerModels),
    [customModels, providerModels, providersState],
  )

  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.id === settings.chatModelId) ?? modelOptions[0] ?? null,
    [modelOptions, settings.chatModelId],
  )
  const availableReasoningEfforts = useMemo(() => {
    if (!selectedModel?.reasoningCapable) {
      return [] as readonly ReasoningEffort[]
    }

    return selectedModel.reasoningEfforts ?? getDefaultReasoningEfforts(selectedModel.providerId)
  }, [selectedModel])
  const reasoningEffort = useMemo(
    () => normalizeReasoningEffort(settings.chatReasoningEffort, availableReasoningEfforts),
    [availableReasoningEfforts, settings.chatReasoningEffort],
  )
  const isModelOptionsLoading =
    isActiveScreen && (isProvidersLoading || !hasLoadedCustomModels || !hasLoadedOpenAICompatibleModels)

  useEffect(() => {
    if (!isActiveScreen) {
      return
    }

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
      .finally(() => {
        if (!isMounted) {
          return
        }

        setHasLoadedCustomModels(true)
      })

    return () => {
      isMounted = false
    }
  }, [isActiveScreen])

  useEffect(() => {
    if (!isActiveScreen || !isProviderConfigured('openai-compatible', providersState)) {
      setHasLoadedOpenAICompatibleModels(true)
      setProviderModels((currentValue) =>
        currentValue.filter((model) => model.providerId !== 'openai-compatible'),
      )
      return
    }

    let isMounted = true
    setHasLoadedOpenAICompatibleModels(false)

    void window.echosphereModels
      .listProviderModels('openai-compatible')
      .then((fetchedModels) => {
        if (!isMounted) {
          return
        }

        setProviderModels((currentValue) => {
          const remainingModels = currentValue.filter((model) => model.providerId !== 'openai-compatible')
          return [...remainingModels, ...fetchedModels]
        })
      })
      .catch((error) => {
        console.error('Failed to load OpenAI-compatible models for chat runtime', error)
      })
      .finally(() => {
        if (!isMounted) {
          return
        }

        setHasLoadedOpenAICompatibleModels(true)
      })

    return () => {
      isMounted = false
    }
  }, [isActiveScreen, providersState])

  useEffect(() => {
    const hasLoadedRuntimeModelSources = hasLoadedCustomModels && hasLoadedOpenAICompatibleModels
    if (!hasLoadedRuntimeModelSources) {
      return
    }

    const nextModelId = selectedModel?.id ?? ''
    if (modelOptions.length === 0 || nextModelId === settings.chatModelId) {
      return
    }

    void updateSettings({ chatModelId: nextModelId })
  }, [
    hasLoadedCustomModels,
    hasLoadedOpenAICompatibleModels,
    modelOptions.length,
    selectedModel?.id,
    settings.chatModelId,
    updateSettings,
  ])

  useEffect(() => {
    const hasLoadedRuntimeModelSources = hasLoadedCustomModels && hasLoadedOpenAICompatibleModels
    if (!hasLoadedRuntimeModelSources) {
      return
    }

    if (availableReasoningEfforts.length === 0 || reasoningEffort === settings.chatReasoningEffort) {
      return
    }

    void updateSettings({ chatReasoningEffort: reasoningEffort })
  }, [
    availableReasoningEfforts.length,
    hasLoadedCustomModels,
    hasLoadedOpenAICompatibleModels,
    reasoningEffort,
    settings.chatReasoningEffort,
    updateSettings,
  ])

  const setSelectedModelId = useCallback(
    (chatModelId: string) => {
      if (chatModelId === settings.chatModelId) {
        return
      }

      void updateSettings({ chatModelId })
    },
    [settings.chatModelId, updateSettings],
  )

  const setReasoningEffort = useCallback(
    (chatReasoningEffort: ReasoningEffort) => {
      if (chatReasoningEffort === settings.chatReasoningEffort) {
        return
      }

      void updateSettings({ chatReasoningEffort })
    },
    [settings.chatReasoningEffort, updateSettings],
  )

  return {
    availableReasoningEfforts,
    hasConfiguredProvider: modelOptions.length > 0,
    isModelOptionsLoading,
    modelOptions,
    providerId: selectedModel?.providerId ?? null,
    providerLabel: selectedModel?.providerLabel ?? null,
    reasoningEffort,
    selectedModelId: selectedModel?.id ?? '',
    selectedRuntimeModelId: selectedModel?.runtimeModelId ?? '',
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector: availableReasoningEfforts.length > 0,
  }
}

export type ChatRuntimeConfigState = ReturnType<typeof useChatRuntimeConfig>
