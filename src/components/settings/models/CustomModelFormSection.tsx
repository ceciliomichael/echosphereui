import { Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DropdownField, type DropdownOption } from '../../ui/DropdownField'
import { SettingsSection } from '../shared/SettingsPanelPrimitives'
import { PRIMARY_ACTION_BUTTON_CLASS_NAME } from '../shared/actionButtonStyles'
import type { CustomModelConfig, CustomModelProviderId, SaveCustomModelInput } from '../../../types/chat'

const CUSTOM_MODEL_PROVIDER_OPTIONS: readonly DropdownOption[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
] as const

const DEFAULT_CUSTOM_MODEL_PROVIDER_ID: CustomModelProviderId = 'openai-compatible'

interface CustomModelFormSectionProps {
  onModelsChanged: (models: CustomModelConfig[]) => void
}

function isCustomModelProviderId(value: string): value is CustomModelProviderId {
  return value === 'openai' || value === 'openai-compatible'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    return message.length > 0 ? message : 'Unable to save custom model.'
  }

  if (typeof error === 'string') {
    const message = error.trim()
    return message.length > 0 ? message : 'Unable to save custom model.'
  }

  return 'Unable to save custom model.'
}

export function CustomModelFormSection({ onModelsChanged }: CustomModelFormSectionProps) {
  const [providerId, setProviderId] = useState<CustomModelProviderId>(DEFAULT_CUSTOM_MODEL_PROVIDER_ID)
  const [modelName, setModelName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [feedbackTone, setFeedbackTone] = useState<'error' | 'success' | null>(null)
  const isMountedRef = useRef(true)

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  const providerDescription =
    providerId === 'openai-compatible'
      ? 'For OpenAI-compatible endpoints that do not expose /models.'
      : 'For manual OpenAI model entries that should appear in the selector.'
  const selectedProviderLabel =
    CUSTOM_MODEL_PROVIDER_OPTIONS.find((option) => option.value === providerId)?.label ?? providerId

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedModelName = modelName.trim()
    if (!trimmedModelName) {
      setValidationError('Model name is required.')
      setFeedbackMessage(null)
      setFeedbackTone(null)
      return
    }

    if (!isCustomModelProviderId(providerId)) {
      setValidationError('Choose a supported provider.')
      setFeedbackMessage(null)
      setFeedbackTone(null)
      return
    }

    setIsSaving(true)
    setValidationError(null)
    setFeedbackMessage(null)
    setFeedbackTone(null)

    const input: SaveCustomModelInput = {
      apiModelId: trimmedModelName,
      label: trimmedModelName,
      providerId,
      reasoningCapable: false,
    }

    try {
      const savedModels = await window.echosphereModels.saveCustomModel(input)
      if (!isMountedRef.current) {
        return
      }

      onModelsChanged(savedModels)
      setModelName('')
      setFeedbackMessage(`Saved ${trimmedModelName} for ${selectedProviderLabel}.`)
      setFeedbackTone('success')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      console.error('Failed to save custom model', error)
      setFeedbackMessage(getErrorMessage(error))
      setFeedbackTone('error')
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false)
      }
    }
  }

  return (
    <SettingsSection title="Add custom model">
      <div className="px-4 py-4 md:px-5">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {providerDescription} Add the provider, enter the model name, and it will be stored for the selector above.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <label htmlFor="custom-model-provider" className="mb-1.5 block text-[13px] font-medium text-foreground">
              Provider
            </label>
            <DropdownField
              id="custom-model-provider"
              ariaLabel="Provider"
              className="w-full"
              options={CUSTOM_MODEL_PROVIDER_OPTIONS}
              triggerClassName="h-11"
              value={providerId}
              onChange={(nextValue) => {
                if (isCustomModelProviderId(nextValue)) {
                  setProviderId(nextValue)
                  setValidationError(null)
                  setFeedbackMessage(null)
                  setFeedbackTone(null)
                }
              }}
            />
          </div>

          <div className="min-w-0">
            <label htmlFor="custom-model-name" className="mb-1.5 block text-[13px] font-medium text-foreground">
              Model name
            </label>
            <input
              id="custom-model-name"
              type="text"
              value={modelName}
              onChange={(event) => {
                setModelName(event.target.value)
                setValidationError(null)
                setFeedbackMessage(null)
                setFeedbackTone(null)
              }}
              placeholder="gpt-4.1-mini"
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground"
              disabled={isSaving}
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className={`${PRIMARY_ACTION_BUTTON_CLASS_NAME} h-11 w-full md:w-auto`}
          >
            <Plus size={16} strokeWidth={2.4} />
            {isSaving ? 'Adding...' : 'Add model'}
          </button>
        </form>

        {validationError || feedbackMessage ? (
          <div
            className={[
              'mt-3 rounded-xl border px-3 py-2 text-sm',
              feedbackTone === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : feedbackTone === 'success'
                  ? 'border-[#d9d6f7] bg-[#f8f7ff] text-[#5b4ec7]'
                  : 'border-border bg-surface-muted text-muted-foreground',
            ].join(' ')}
          >
            {validationError ?? feedbackMessage}
          </div>
        ) : null}
      </div>
    </SettingsSection>
  )
}
