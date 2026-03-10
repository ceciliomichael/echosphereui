import { useEffect, useMemo, useState } from 'react'
import type { ProvidersState, ReasoningEffort } from '../types/chat'
import { MODEL_CATALOG } from '../components/settings/models/modelCatalog'
import { readStoredModelToggleState } from '../components/settings/models/modelStorage'

const SELECTED_CODEX_MODEL_STORAGE_KEY = 'echosphere:chat:codex:model'
const REASONING_EFFORT_STORAGE_KEY = 'echosphere:chat:reasoning-effort'

const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']

interface ChatModelOption {
  id: string
  label: string
  reasoningCapable: boolean
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

function buildCodexModelOptions(): ChatModelOption[] {
  const modelToggleState = readStoredModelToggleState()
  const codexModels = MODEL_CATALOG.filter((model) => model.providerId === 'codex')
  const enabledCodexModels = codexModels.filter((model) => modelToggleState[model.id])
  const sourceModels = enabledCodexModels.length > 0 ? enabledCodexModels : codexModels

  return sourceModels.map((model) => ({
    id: model.id,
    label: model.label,
    reasoningCapable: model.reasoningCapable ?? false,
  }))
}

export function useChatRuntimeConfig(providersState: ProvidersState | null) {
  const codexModelOptions = useMemo(() => buildCodexModelOptions(), [])
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const storedValue = readStoredStringValue(SELECTED_CODEX_MODEL_STORAGE_KEY)
    const hasStoredValue = codexModelOptions.some((model) => model.id === storedValue)
    return hasStoredValue ? storedValue : codexModelOptions[0]?.id ?? ''
  })
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => readStoredReasoningEffort())

  const selectedModel = useMemo(
    () => codexModelOptions.find((model) => model.id === selectedModelId) ?? codexModelOptions[0] ?? null,
    [codexModelOptions, selectedModelId],
  )

  useEffect(() => {
    if (!selectedModel) {
      return
    }

    if (selectedModel.id !== selectedModelId) {
      setSelectedModelId(selectedModel.id)
    }
  }, [selectedModel, selectedModelId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      if (selectedModelId.trim().length > 0) {
        window.localStorage.setItem(SELECTED_CODEX_MODEL_STORAGE_KEY, selectedModelId)
      }
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
    codexModelOptions,
    isCodexAuthenticated: Boolean(providersState?.codex.isAuthenticated),
    providerId: 'codex' as const,
    reasoningEffort,
    selectedModelId: selectedModel?.id ?? '',
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector: Boolean(selectedModel?.reasoningCapable),
  }
}
