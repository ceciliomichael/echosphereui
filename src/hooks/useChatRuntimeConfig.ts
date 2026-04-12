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
  ChatMode,
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
  activeChatMode: ChatMode
  isActiveScreen: boolean
  isProvidersLoading: boolean
  providersState: ProvidersState | null
  settings: Pick<
    AppSettings,
    | 'agentModelId'
    | 'agentModelLabel'
    | 'agentModelProviderId'
    | 'chatModelId'
    | 'chatModelLabel'
    | 'chatModelProviderId'
    | 'chatReasoningEffort'
    | 'planModelId'
    | 'planModelLabel'
    | 'planModelProviderId'
  >
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
}

function getDefaultReasoningEfforts(providerId: ChatProviderId | null) {
  if (providerId === 'openai-compatible') {
    return OPENAI_COMPATIBLE_REASONING_EFFORT_VALUES
  }

  return DEFAULT_REASONING_EFFORT_VALUES
}

function findSelectedModel(
  options: readonly ChatModelOption[],
  selection: {
    modelId: string
    providerId: ChatProviderId | null
  },
): ChatModelOption | null {
  const normalizedModelId = selection.modelId.trim()
  if (normalizedModelId.length === 0) {
    return options[0] ?? null
  }

  if (selection.providerId) {
    const sameProviderModel = options.find(
      (option) => option.id === normalizedModelId && option.providerId === selection.providerId,
    )
    if (sameProviderModel) {
      return sameProviderModel
    }
  }

  return options.find((option) => option.id === normalizedModelId) ?? options[0] ?? null
}

function getModeSelectionFields(
  activeChatMode: ChatMode,
  settings: Pick<
    AppSettings,
    | 'agentModelId'
    | 'agentModelLabel'
    | 'agentModelProviderId'
    | 'chatModelId'
    | 'chatModelLabel'
    | 'chatModelProviderId'
    | 'planModelId'
    | 'planModelLabel'
    | 'planModelProviderId'
  >,
) {
  if (activeChatMode === 'plan') {
    return {
      modelId: settings.planModelId.trim().length > 0 ? settings.planModelId : settings.chatModelId,
      modelLabel: settings.planModelLabel.trim().length > 0 ? settings.planModelLabel : settings.chatModelLabel,
      providerId: settings.planModelProviderId ?? settings.chatModelProviderId,
      updateKeys: {
        modelId: 'planModelId',
        modelLabel: 'planModelLabel',
        providerId: 'planModelProviderId',
      } as const,
    }
  }

  return {
    modelId: settings.agentModelId.trim().length > 0 ? settings.agentModelId : settings.chatModelId,
    modelLabel: settings.agentModelLabel.trim().length > 0 ? settings.agentModelLabel : settings.chatModelLabel,
    providerId: settings.agentModelProviderId ?? settings.chatModelProviderId,
    updateKeys: {
      modelId: 'agentModelId',
      modelLabel: 'agentModelLabel',
      providerId: 'agentModelProviderId',
    } as const,
  }
}

export function useChatRuntimeConfig({
  activeChatMode,
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
  const modeSelection = useMemo(
    () => getModeSelectionFields(activeChatMode, settings),
    [activeChatMode, settings],
  )
  const missingSelectedModelOption = useMemo(() => {
    const normalizedSavedModelId = modeSelection.modelId.trim()
    const hasExactCatalogMatch = modelOptions.some((option) => {
      if (option.id !== normalizedSavedModelId) {
        return false
      }

      if (modeSelection.providerId === null) {
        return true
      }

      return option.providerId === modeSelection.providerId
    })

    if (normalizedSavedModelId.length === 0 || hasExactCatalogMatch) {
      return null
    }

    const fallbackProviderLabel =
      modeSelection.providerId === null
        ? 'Saved model'
        : PROVIDER_SECTIONS.find((provider) => provider.id === modeSelection.providerId)?.label ?? 'Saved model'
    const fallbackLabel = modeSelection.modelLabel.trim().length > 0 ? modeSelection.modelLabel.trim() : normalizedSavedModelId

    return {
      id: normalizedSavedModelId,
      isCatalogBacked: false,
      label: fallbackLabel,
      providerId: modeSelection.providerId,
      providerLabel: fallbackProviderLabel,
      reasoningCapable: false,
      runtimeModelId: normalizedSavedModelId,
    } satisfies ChatModelOption
  }, [modeSelection.modelId, modeSelection.modelLabel, modeSelection.providerId, modelOptions])
  const runtimeModelOptions = useMemo(
    () => (missingSelectedModelOption ? [missingSelectedModelOption, ...modelOptions] : modelOptions),
    [missingSelectedModelOption, modelOptions],
  )

  const selectedModel = useMemo(
    () =>
      findSelectedModel(runtimeModelOptions, {
        modelId: modeSelection.modelId,
        providerId: modeSelection.providerId,
      }),
    [modeSelection.modelId, modeSelection.providerId, runtimeModelOptions],
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
  const hasSavedModelId = modeSelection.modelId.trim().length > 0
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
    if (!hasLoadedRuntimeModelSources || modeSelection.modelId.trim().length > 0) {
      return
    }

    const nextModel = modelOptions[0]
    if (!nextModel) {
      return
    }

    void updateSettings({
      [modeSelection.updateKeys.modelId]: nextModel.id,
      [modeSelection.updateKeys.providerId]: nextModel.providerId,
      [modeSelection.updateKeys.modelLabel]: nextModel.label,
      chatModelId: nextModel.id,
      chatModelProviderId: nextModel.providerId,
      chatModelLabel: nextModel.label,
    })
  }, [
    hasLoadedCustomModels,
    hasLoadedOpenAICompatibleModels,
    modelOptions,
    modeSelection.modelId,
    modeSelection.updateKeys.modelId,
    modeSelection.updateKeys.modelLabel,
    modeSelection.updateKeys.providerId,
    updateSettings,
  ])

  useEffect(() => {
    if (!selectedModel?.isCatalogBacked) {
      return
    }

    if (modeSelection.providerId === selectedModel.providerId) {
      return
    }

    void updateSettings({
      [modeSelection.updateKeys.providerId]: selectedModel.providerId,
      chatModelProviderId: selectedModel.providerId,
    })
  }, [modeSelection.providerId, modeSelection.updateKeys.providerId, selectedModel, updateSettings])

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
      if (chatModelId === modeSelection.modelId && nextProviderId === modeSelection.providerId) {
        return
      }

      void updateSettings({
        [modeSelection.updateKeys.modelId]: chatModelId,
        [modeSelection.updateKeys.providerId]: nextProviderId,
        [modeSelection.updateKeys.modelLabel]: selectedOption?.label ?? chatModelId,
        chatModelId,
        chatModelProviderId: nextProviderId,
        chatModelLabel: selectedOption?.label ?? chatModelId,
      })
    },
    [
      modeSelection.modelId,
      modeSelection.providerId,
      modeSelection.updateKeys.modelId,
      modeSelection.updateKeys.modelLabel,
      modeSelection.updateKeys.providerId,
      runtimeModelOptions,
      updateSettings,
    ],
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
    selectedModelId: selectedModel?.id ?? modeSelection.modelId,
    selectedRuntimeModelId: selectedModel?.runtimeModelId ?? modeSelection.modelId,
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector: availableReasoningEfforts.length > 0,
  }
}

export type ChatRuntimeConfigState = ReturnType<typeof useChatRuntimeConfig>
