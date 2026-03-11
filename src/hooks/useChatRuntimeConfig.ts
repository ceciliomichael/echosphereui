import { useCallback, useEffect, useMemo, useState } from 'react'
import { MODEL_CATALOG, PROVIDER_SECTIONS } from '../components/settings/models/modelCatalog'
import { toCustomModelCatalogItems } from '../components/settings/models/customModelUtils'
import { readStoredModelToggleState } from '../components/settings/models/modelStorage'
import { isProviderConfigured } from '../components/settings/models/modelViewUtils'
import type { AppSettings, ChatProviderId, CustomModelConfig, ProvidersState, ReasoningEffort } from '../types/chat'

interface ChatModelOption {
  id: string
  label: string
  providerId: ChatProviderId
  providerLabel: string
  reasoningCapable: boolean
  runtimeModelId: string
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

interface UseChatRuntimeConfigInput {
  providersState: ProvidersState | null
  settings: Pick<AppSettings, 'chatModelId' | 'chatReasoningEffort'>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
}

export function useChatRuntimeConfig({ providersState, settings, updateSettings }: UseChatRuntimeConfigInput) {
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([])
  const modelOptions = useMemo(() => buildChatModelOptions(providersState, customModels), [customModels, providersState])

  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.id === settings.chatModelId) ?? modelOptions[0] ?? null,
    [modelOptions, settings.chatModelId],
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
    const nextModelId = selectedModel?.id ?? ''
    if (modelOptions.length === 0 || nextModelId === settings.chatModelId) {
      return
    }

    void updateSettings({ chatModelId: nextModelId })
  }, [modelOptions.length, selectedModel?.id, settings.chatModelId, updateSettings])

  const setSelectedModelId = useCallback(
    (chatModelId: string) => {
      void updateSettings({ chatModelId })
    },
    [updateSettings],
  )

  const setReasoningEffort = useCallback(
    (chatReasoningEffort: ReasoningEffort) => {
      void updateSettings({ chatReasoningEffort })
    },
    [updateSettings],
  )

  return {
    hasConfiguredProvider: modelOptions.length > 0,
    modelOptions,
    providerId: selectedModel?.providerId ?? null,
    providerLabel: selectedModel?.providerLabel ?? null,
    reasoningEffort: settings.chatReasoningEffort,
    selectedModelId: selectedModel?.id ?? '',
    selectedRuntimeModelId: selectedModel?.runtimeModelId ?? '',
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector: Boolean(selectedModel?.reasoningCapable),
  }
}
