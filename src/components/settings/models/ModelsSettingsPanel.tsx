import { useEffect, useMemo, useState } from 'react'
import type { CustomModelConfig, CustomModelProviderId, ProvidersState } from '../../../types/chat'
import { SettingsPanelLayout } from '../shared/SettingsPanelPrimitives'
import { ModelsProviderSection } from './ModelsProviderSection'
import { readStoredModelToggleState, writeStoredModelToggleState } from './modelStorage'
import type { ModelToggleState } from './modelTypes'
import { buildModelProviderSections, isProviderConfigured } from './modelViewUtils'
import { PROVIDER_SECTIONS } from './modelCatalog'
import { DropdownField } from '../../ui/DropdownField'

interface ModelsSettingsPanelProps {
  isProvidersLoading: boolean
  providersState: ProvidersState | null
}

const CUSTOM_MODEL_PROVIDER_IDS: readonly CustomModelProviderId[] = ['openai', 'openai-compatible']

function isCustomModelProviderId(value: string): value is CustomModelProviderId {
  return CUSTOM_MODEL_PROVIDER_IDS.some((providerId) => providerId === value)
}

interface CustomModelDraft {
  apiModelId: string
  label: string
  providerId: CustomModelProviderId | ''
  reasoningCapable: boolean
}

export function ModelsSettingsPanel({ isProvidersLoading, providersState }: ModelsSettingsPanelProps) {
  const [toggleState, setToggleState] = useState<ModelToggleState>(() => readStoredModelToggleState())
  const [customModels, setCustomModels] = useState<CustomModelConfig[]>([])
  const [customModelsError, setCustomModelsError] = useState<string | null>(null)
  const [isCustomModelsLoading, setIsCustomModelsLoading] = useState(true)
  const [isSavingCustomModel, setIsSavingCustomModel] = useState(false)
  const [removingCustomModelId, setRemovingCustomModelId] = useState<string | null>(null)
  const [customModelDraft, setCustomModelDraft] = useState<CustomModelDraft>({
    apiModelId: '',
    label: '',
    providerId: '',
    reasoningCapable: true,
  })

  useEffect(() => {
    writeStoredModelToggleState(toggleState)
  }, [toggleState])

  useEffect(() => {
    let isMounted = true

    setIsCustomModelsLoading(true)
    setCustomModelsError(null)

    void window.echosphereModels
      .listCustomModels()
      .then((nextModels) => {
        if (!isMounted) {
          return
        }

        setCustomModels(nextModels)
      })
      .catch((error) => {
        console.error('Failed to load custom models', error)
        if (isMounted) {
          setCustomModelsError('Unable to load custom models.')
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCustomModelsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const providerSections = useMemo(
    () => buildModelProviderSections('', providersState, customModels),
    [customModels, providersState],
  )
  const customProviderOptions = useMemo(
    () =>
      PROVIDER_SECTIONS.filter(
        (provider) => isCustomModelProviderId(provider.id) && isProviderConfigured(provider.id, providersState),
      ).map((provider) => ({
          label: provider.label,
          value: provider.id,
        })),
    [providersState],
  )

  function handleToggleModel(modelId: string) {
    const matchingModel = providerSections.flatMap((section) => section.models).find((model) => model.id === modelId)
    setToggleState((currentToggleState) => ({
      ...currentToggleState,
      [modelId]: !(currentToggleState[modelId] ?? matchingModel?.enabledByDefault ?? false),
    }))
  }

  useEffect(() => {
    setCustomModelDraft((currentValue) => {
      if (customProviderOptions.length === 0) {
        if (currentValue.providerId === '') {
          return currentValue
        }

        return {
          ...currentValue,
          providerId: '',
        }
      }

      const providerIsValid = customProviderOptions.some((option) => option.value === currentValue.providerId)
      if (providerIsValid) {
        return currentValue
      }

      return {
        ...currentValue,
        providerId: customProviderOptions[0].value as CustomModelProviderId,
      }
    })
  }, [customProviderOptions])

  async function handleSaveCustomModel() {
    const apiModelId = customModelDraft.apiModelId.trim()
    const providerId = customModelDraft.providerId
    if (!providerId) {
      setCustomModelsError('Select a provider for the custom model.')
      return
    }

    if (!apiModelId) {
      setCustomModelsError('Model ID is required.')
      return
    }

    setIsSavingCustomModel(true)
    setCustomModelsError(null)

    try {
      const nextCustomModels = await window.echosphereModels.saveCustomModel({
        apiModelId,
        label: customModelDraft.label.trim() || undefined,
        providerId,
        reasoningCapable: customModelDraft.reasoningCapable,
      })

      setCustomModels(nextCustomModels)
      setToggleState((currentValue) => {
        const nextValue: ModelToggleState = { ...currentValue }
        for (const model of nextCustomModels) {
          if (nextValue[model.id] === undefined) {
            nextValue[model.id] = true
          }
        }

        return nextValue
      })
      setCustomModelDraft((currentValue) => ({
        ...currentValue,
        apiModelId: '',
        label: '',
      }))
    } catch (error) {
      console.error('Failed to save custom model', error)
      setCustomModelsError(error instanceof Error && error.message.trim().length > 0 ? error.message : 'Unable to save model.')
    } finally {
      setIsSavingCustomModel(false)
    }
  }

  async function handleRemoveCustomModel(modelId: string) {
    setRemovingCustomModelId(modelId)
    setCustomModelsError(null)

    try {
      const nextCustomModels = await window.echosphereModels.removeCustomModel(modelId)
      setCustomModels(nextCustomModels)
      setToggleState((currentValue) => {
        const nextValue = {
          ...currentValue,
        }
        delete nextValue[modelId]
        return nextValue
      })
    } catch (error) {
      console.error('Failed to remove custom model', error)
      setCustomModelsError(
        error instanceof Error && error.message.trim().length > 0 ? error.message : 'Unable to remove model.',
      )
    } finally {
      setRemovingCustomModelId(null)
    }
  }

  return (
    <SettingsPanelLayout title="Models">
      <section className="flex flex-col gap-3 pb-4 md:pb-5">
        <header>
          <h3 className="text-[15px] font-medium text-foreground md:text-base">Model Access</h3>
        </header>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Only configured providers appear here. Turn models on or off per provider.
          </p>

          <section className="rounded-2xl border border-border bg-surface p-4 md:p-5">
            <header className="mb-3">
              <h4 className="text-sm font-medium text-foreground md:text-[15px]">Add Custom Model</h4>
            </header>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Provider</label>
                <DropdownField
                  ariaLabel="Custom model provider"
                  value={customModelDraft.providerId}
                  onChange={(value) =>
                    setCustomModelDraft((currentValue) => ({
                      ...currentValue,
                      providerId: value as CustomModelProviderId,
                    }))
                  }
                  options={customProviderOptions}
                  disabled={isProvidersLoading || isCustomModelsLoading || customProviderOptions.length === 0}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="custom-model-id" className="text-sm font-medium text-foreground">
                  Model ID
                </label>
                <input
                  id="custom-model-id"
                  type="text"
                  value={customModelDraft.apiModelId}
                  onChange={(event) =>
                    setCustomModelDraft((currentValue) => ({
                      ...currentValue,
                      apiModelId: event.target.value,
                    }))
                  }
                  placeholder="e.g. gpt-oss-120b"
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
                  disabled={isCustomModelsLoading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="custom-model-label" className="text-sm font-medium text-foreground">
                  Display label (optional)
                </label>
                <input
                  id="custom-model-label"
                  type="text"
                  value={customModelDraft.label}
                  onChange={(event) =>
                    setCustomModelDraft((currentValue) => ({
                      ...currentValue,
                      label: event.target.value,
                    }))
                  }
                  placeholder="Defaults to Model ID"
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
                  disabled={isCustomModelsLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Reasoning support</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={customModelDraft.reasoningCapable}
                  onClick={() =>
                    setCustomModelDraft((currentValue) => ({
                      ...currentValue,
                      reasoningCapable: !currentValue.reasoningCapable,
                    }))
                  }
                  disabled={isCustomModelsLoading}
                  className="flex h-11 w-full items-center justify-between rounded-xl border border-border bg-surface px-3 text-sm text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{customModelDraft.reasoningCapable ? 'Enabled' : 'Disabled'}</span>
                  <span
                    className={[
                      'relative h-6 w-11 rounded-full transition-colors',
                      customModelDraft.reasoningCapable ? 'bg-emerald-500' : 'bg-border',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform',
                        customModelDraft.reasoningCapable ? 'translate-x-5' : 'translate-x-0',
                      ].join(' ')}
                    />
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveCustomModel()}
                disabled={isSavingCustomModel || isCustomModelsLoading || customProviderOptions.length === 0}
                className="h-10 rounded-xl border border-[#d8d8d8] bg-white px-3.5 text-sm font-medium text-black transition-[background-color,border-color,box-shadow,transform,color] duration-150 hover:border-[#b8b8b8] hover:bg-[#e7e7e7] hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white disabled:border-[#d8d8d8] disabled:text-black/55"
              >
                {isSavingCustomModel ? 'Saving...' : 'Add model'}
              </button>
            </div>
          </section>

          {customModelsError ? (
            <p className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
              {customModelsError}
            </p>
          ) : null}

          {providerSections.length > 0 ? (
            <div className="space-y-3">
              {providerSections.map((section) => (
                <ModelsProviderSection
                  key={section.provider.id}
                  configured={section.configured}
                  isProviderStateLoading={isProvidersLoading || isCustomModelsLoading}
                  isRemovingCustomModel={removingCustomModelId !== null}
                  models={section.models}
                  onRemoveCustomModel={handleRemoveCustomModel}
                  providerDescription={section.provider.description}
                  providerLabel={section.provider.label}
                  toggleState={toggleState}
                  onToggleModel={handleToggleModel}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No configured providers yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Configure a provider first to manage its models.</p>
            </div>
          )}
        </div>
      </section>
    </SettingsPanelLayout>
  )
}
