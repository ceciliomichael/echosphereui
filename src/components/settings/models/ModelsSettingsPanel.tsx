import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ModelToggleState } from './modelTypes'
import type { ProviderModelConfig, ProvidersState } from '../../../types/chat'
import { readStoredModelToggleState, writeStoredModelToggleState } from './modelStorage'
import { buildModelProviderSections } from './modelViewUtils'
import { getProviderModelLoadErrorMessage } from './modelLoadErrorUtils'
import { mergeProviderModels } from './providerModelMergeUtils'
import { Switch } from '../../ui/Switch'

interface RemoteModelState {
  errorMessage: string | null
  isLoading: boolean
  models: ProviderModelConfig[]
}

interface ModelsSettingsPanelProps {
  providersState: ProvidersState | null
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

export function ModelsSettingsPanel({ providersState }: ModelsSettingsPanelProps) {
  const [searchValue, setSearchValue] = useState('')
  const [toggleState, setToggleState] = useState<ModelToggleState>(() => readStoredModelToggleState())
  const [remoteState, setRemoteState] = useState<RemoteModelState>({
    errorMessage: null,
    isLoading: false,
    models: [],
  })
  const normalizedSearchValue = normalizeSearchValue(searchValue)
  const providerSections = useMemo(
    () => buildModelProviderSections(normalizedSearchValue, providersState, [], remoteState.models),
    [normalizedSearchValue, providersState, remoteState.models],
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

  useEffect(() => {
    writeStoredModelToggleState(toggleState)
  }, [toggleState])

  useEffect(() => {
    const isOpenAICompatibleConfigured = Boolean(
      providersState?.apiKeyProviders.find((provider) => provider.id === 'openai-compatible')?.configured,
    )

    if (!isOpenAICompatibleConfigured) {
      setRemoteState((currentValue) => ({
        errorMessage: null,
        isLoading: false,
        models: currentValue.models,
      }))
      return
    }

    let isMounted = true

    setRemoteState((currentValue) => ({
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

        setRemoteState((currentValue) => ({
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
        const errorMessage = getProviderModelLoadErrorMessage(error)
        setRemoteState((currentValue) => ({
          errorMessage,
          isLoading: false,
          models: currentValue.models,
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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[780px] items-center justify-center py-2 md:py-3">
      <div className="flex h-[min(720px,calc(100vh-10rem))] w-full flex-col gap-2">
        <header className="px-4 pb-0">
          <h2 className="text-[21px] font-medium tracking-tight text-foreground md:text-[24px]">Models</h2>
        </header>

        <section className="flex min-h-0 flex-1 flex-col gap-2 pb-0">
          {remoteState.errorMessage ? (
            <div className="rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
              {remoteState.errorMessage}
            </div>
          ) : null}

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-4 py-3 md:px-5">
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
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
                <div className="px-4 py-6 text-sm text-muted-foreground md:px-5">
                  No models are available until at least one provider is configured.
                </div>
              ) : providerSections.length === 0 && !remoteState.isLoading ? (
                <div className="px-4 py-6 text-sm text-muted-foreground md:px-5">
                  No models found.
                </div>
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
        </section>
      </div>
    </div>
  )
}
