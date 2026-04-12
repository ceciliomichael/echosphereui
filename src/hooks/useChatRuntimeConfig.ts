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
  isCatalogBacked: boolean
  label: string
  providerId: ChatProviderId | null
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
      isCatalogBacked: true,
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
  settings: Pick<AppSettings, 'chatModelId' | 'chatModelProviderId' | 'chatModelLabel' | 'chatReasoningEffort'>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
}

function getDefaultReasoningEfforts(providerId: ChatProviderId | null) {
  if (providerId === 'openai-compatible') {
    return OPENAI_COMPATIBLE_REASONING_EFFORT_VALUES
  }

  return DEFAULT_REASONING_EFFORT_VALUES
}

function withSavedReasoningEffort(
  options: readonly ReasoningEffort[],
  savedReasoningEffort: ReasoningEffort,
): readonly ReasoningEffort[] {
  if (options.includes(savedReasoningEffort)) {
    return options
  }

  return [savedReasoningEffort, ...options]
}

function findSelectedModel(
  options: readonly ChatModelOption[],
  settings: Pick<AppSettings, 'chatModelId' | 'chatModelProviderId'>,
): ChatModelOption | null {
  const normalizedModelId = settings.chatModelId.trim()
  if (normalizedModelId.length === 0) {
    return options[0] ?? null
  }

  if (settings.chatModelProviderId) {
    const sameProviderModel = options.find(
      (option) => option.id === normalizedModelId && option.providerId === settings.chatModelProviderId,
    )
    if (sameProviderModel) {
      return sameProviderModel
    }
  }

  return options.find((option) => option.id === normalizedModelId) ?? options[0] ?? null
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
  const missingSelectedModelOption = useMemo(() => {
    const normalizedSavedModelId = settings.chatModelId.trim()
    const hasExactCatalogMatch = modelOptions.some((option) => {
      if (option.id !== normalizedSavedModelId) {
        return false
      }

      if (settings.chatModelProviderId === null) {
        return true
      }

      return option.providerId === settings.chatModelProviderId
    })

    if (normalizedSavedModelId.length === 0 || hasExactCatalogMatch) {
      return null
    }

    const fallbackProviderLabel =
      settings.chatModelProviderId === null
        ? 'Saved model'
        : PROVIDER_SECTIONS.find((provider) => provider.id === settings.chatModelProviderId)?.label ?? 'Saved model'
    const fallbackLabel = settings.chatModelLabel.trim().length > 0 ? settings.chatModelLabel.trim() : normalizedSavedModelId

    return {
      id: normalizedSavedModelId,
      isCatalogBacked: false,
      label: fallbackLabel,
      providerId: settings.chatModelProviderId,
      providerLabel: fallbackProviderLabel,
      reasoningCapable: true,
      reasoningEfforts: withSavedReasoningEffort(
        getDefaultReasoningEfforts(settings.chatModelProviderId),
        settings.chatReasoningEffort,
      ),
      runtimeModelId: normalizedSavedModelId,
    } satisfies ChatModelOption
  }, [modelOptions, settings.chatModelId, settings.chatModelLabel, settings.chatModelProviderId, settings.chatReasoningEffort])
  const runtimeModelOptions = useMemo(
    () => (missingSelectedModelOption ? [missingSelectedModelOption, ...modelOptions] : modelOptions),
    [missingSelectedModelOption, modelOptions],
  )

  const selectedModel = useMemo(
    () => findSelectedModel(runtimeModelOptions, settings),
    [runtimeModelOptions, settings],
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
  const hasSavedModelId = settings.chatModelId.trim().length > 0
  const isModelOptionsLoading =
    !hasSavedModelId &&
    isActiveScreen &&
    (isProvidersLoading || !hasLoadedCustomModels || !hasLoadedOpenAICompatibleModels)

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
    if (!hasLoadedRuntimeModelSources || settings.chatModelId.trim().length > 0) {
      return
    }

    const nextModel = modelOptions[0]
    if (!nextModel) {
      return
    }

    void updateSettings({
      chatModelId: nextModel.id,
      chatModelProviderId: nextModel.providerId,
      chatModelLabel: nextModel.label,
    })
  }, [
    hasLoadedCustomModels,
    hasLoadedOpenAICompatibleModels,
    modelOptions,
    settings.chatModelId,
    updateSettings,
  ])

  useEffect(() => {
    if (!selectedModel?.isCatalogBacked) {
      return
    }

    if (settings.chatModelProviderId === selectedModel.providerId) {
      return
    }

    void updateSettings({ chatModelProviderId: selectedModel.providerId })
  }, [selectedModel, settings.chatModelProviderId, updateSettings])

  useEffect(() => {
    const hasLoadedRuntimeModelSources = hasLoadedCustomModels && hasLoadedOpenAICompatibleModels
    if (!hasLoadedRuntimeModelSources || !selectedModel?.isCatalogBacked) {
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
    selectedModel,
    settings.chatReasoningEffort,
    updateSettings,
  ])

  const setSelectedModelId = useCallback(
    (chatModelId: string) => {
      const selectedOption = runtimeModelOptions.find((option) => option.id === chatModelId) ?? null
      const nextProviderId = selectedOption?.providerId ?? null
      if (chatModelId === settings.chatModelId && nextProviderId === settings.chatModelProviderId) {
        return
      }

      void updateSettings({
        chatModelId,
        chatModelProviderId: nextProviderId,
        chatModelLabel: selectedOption?.label ?? chatModelId,
      })
    },
    [runtimeModelOptions, settings.chatModelId, settings.chatModelProviderId, updateSettings],
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
    modelOptions: runtimeModelOptions,
    providerId: selectedModel?.providerId ?? null,
    providerLabel: selectedModel?.providerLabel ?? null,
    reasoningEffort,
    selectedModelId: selectedModel?.id ?? settings.chatModelId,
    selectedRuntimeModelId: selectedModel?.runtimeModelId ?? settings.chatModelId,
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector: availableReasoningEfforts.length > 0,
  }
}

export type ChatRuntimeConfigState = ReturnType<typeof useChatRuntimeConfig>
