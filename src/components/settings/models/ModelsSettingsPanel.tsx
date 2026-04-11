import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CustomModelFormSection } from './CustomModelFormSection'
import type { ModelToggleState } from './modelTypes'
import { buildModelProviderSections } from './modelViewUtils'
import { getProviderModelLoadErrorMessage } from './modelLoadErrorUtils'
import { mergeProviderModels } from './providerModelMergeUtils'
import { readStoredModelToggleState, writeStoredModelToggleState } from './modelStorage'
import { SETTINGS_SECTION_TITLE_CLASS_NAME } from '../shared/SettingsPanelPrimitives'
import { Switch } from '../../ui/Switch'
import type { CustomModelConfig, ProviderModelConfig, ProvidersState } from '../../../types/chat'

interface LoadedModelState<T> {
  errorMessage: string | null
  isLoading: boolean
  models: T[]
}

interface ModelsSettingsPanelProps {
  providersState: ProvidersState | null
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
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

export function ModelsSettingsPanel({ providersState }: ModelsSettingsPanelProps) {
  const [searchValue, setSearchValue] = useState('')
  const [toggleState, setToggleState] = useState<ModelToggleState>(() => readStoredModelToggleState())
  const [providerModelsState, setProviderModelsState] = useState<LoadedModelState<ProviderModelConfig>>({
    errorMessage: null,
    isLoading: false,
    models: [],
  })
  const [customModelsState, setCustomModelsState] = useState<LoadedModelState<CustomModelConfig>>({
    errorMessage: null,
    isLoading: false,
    models: [],
  })

  const normalizedSearchValue = normalizeSearchValue(searchValue)
  const providerSections = useMemo(
    () =>
      buildModelProviderSections(
        normalizedSearchValue,
        providersState,
        customModelsState.models,
        providerModelsState.models,
      ),
    [customModelsState.models, normalizedSearchValue, providerModelsState.models, providersState],
  )
  const mixedModels = useMemo(
    () =>
      providerSections.flatMap((section) =>
        section.models.map((model) => ({
          model,
          providerLabel: section.provider.label,
        })),
      ),
    [providerSections],
  )
  const hasConfiguredProvider = providerSections.length > 0
  const isAnyModelsLoading = providerModelsState.isLoading || customModelsState.isLoading

  useEffect(() => {
    writeStoredModelToggleState(toggleState)
  }, [toggleState])

  useEffect(() => {
    let isMounted = true

    setCustomModelsState((currentValue) => ({
      ...currentValue,
      errorMessage: null,
      isLoading: true,
    }))

    void window.echosphereModels
      .listCustomModels()
      .then((models) => {
        if (!isMounted) {
          return
        }

        setCustomModelsState((currentValue) => ({
          errorMessage: null,
          isLoading: false,
          models: mergeCustomModels(currentValue.models, models),
        }))
      })
      .catch((error) => {
        if (!isMounted) {
          return
        }

        console.error('Failed to load custom models', error)
        setCustomModelsState((currentValue) => ({
          ...currentValue,
          errorMessage: getLoadErrorMessage(error, 'Unable to load saved custom models.'),
          isLoading: false,
        }))
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const isOpenAICompatibleConfigured = Boolean(
      providersState?.apiKeyProviders.find((provider) => provider.id === 'openai-compatible')?.configured,
    )

    if (!isOpenAICompatibleConfigured) {
      setProviderModelsState((currentValue) => ({
        errorMessage: null,
        isLoading: false,
        models: currentValue.models,
      }))
      return
    }

    let isMounted = true

    setProviderModelsState((currentValue) => ({
      ...currentValue,
      errorMessage: null,
      isLoading: true,
    }))

    void window.echosphereModels
      .listProviderModels('openai-compatible')
      .then((models) => {
        if (!isMounted) {
          return
        }

        setProviderModelsState((currentValue) => ({
          errorMessage: null,
          isLoading: false,
          models: mergeProviderModels(currentValue.models, models),
        }))
      })
      .catch((error) => {
        if (!isMounted) {
          return
        }

        console.error('Failed to load OpenAI-compatible models', error)
        setProviderModelsState((currentValue) => ({
          ...currentValue,
          errorMessage: getProviderModelLoadErrorMessage(error),
          isLoading: false,
        }))
      })

    return () => {
      isMounted = false
    }
  }, [providersState])

  function handleToggleModel(modelId: string) {
    setToggleState((currentValue) => ({
      ...currentValue,
      [modelId]: !(currentValue[modelId] ?? mixedModels.find((item) => item.model.id === modelId)?.model.enabledByDefault ?? true),
    }))
  }

  function handleCustomModelsChanged(models: CustomModelConfig[]) {
    setCustomModelsState({
      errorMessage: null,
      isLoading: false,
      models,
    })
  }

  return (
    <div className="flex w-full max-w-[780px] flex-col gap-3">
      <header className="flex flex-col gap-1 px-1 pt-1">
        <h2 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Models</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Browse available provider models and custom models, then toggle the ones you want active in the workspace.
        </p>
      </header>

      {customModelsState.errorMessage ? (
        <div className="rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
          {customModelsState.errorMessage}
        </div>
      ) : null}

      {providerModelsState.errorMessage ? (
        <div className="rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
          {providerModelsState.errorMessage}
        </div>
      ) : null}

      <section className="flex h-[520px] flex-none flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm md:h-[560px]">
        <div className="border-b border-border px-4 py-3 md:px-5">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search models..."
              disabled={!hasConfiguredProvider}
              className="h-10 w-full rounded-xl border border-border bg-surface-muted pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!hasConfiguredProvider ? (
            isAnyModelsLoading ? (
              <div className="px-4 py-6 text-sm text-muted-foreground md:px-5">Loading models...</div>
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground md:px-5">
                No models are available until at least one provider is configured.
              </div>
            )
          ) : providerSections.length === 0 && !isAnyModelsLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground md:px-5">No models found.</div>
          ) : (
            mixedModels.map((item, modelIndex) => {
              const { model, providerLabel } = item
              const isEnabled = Boolean(toggleState[model.id] ?? model.enabledByDefault)

              return (
                <div
                  key={model.id}
                  className={[
                    'flex min-h-14 items-center justify-between gap-3 px-4 py-3 md:px-5',
                    modelIndex === 0 ? '' : 'border-t border-border',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{model.label}</p>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {providerLabel}
                    </p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    label={`Enable ${model.label}`}
                    onChange={() => handleToggleModel(model.id)}
                  />
                </div>
              )
            })
          )}
        </div>
      </section>

      <CustomModelFormSection onModelsChanged={handleCustomModelsChanged} />
    </div>
  )
}
