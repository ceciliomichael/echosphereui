import { useEffect, useMemo, useState } from 'react'
import type { ApiKeyProviderId, ProvidersState, SaveApiKeyProviderInput } from '../../../types/chat'
import { ApiKeyProviderAccordion } from './ApiKeyProviderAccordion'
import { CodexProviderAccordion } from './CodexProviderAccordion'
import {
  buildInitialDraftMap,
  isValidMaxTokens,
  isValidTemperature,
  normalizeOptionalIntegerInput,
  normalizeOptionalNumericInput,
  operationForProvider,
} from './providerDraftUtils'
import { readProviderDefaults, writeProviderDefaults } from './providerLocalDefaults'
import { API_KEY_PROVIDER_SCHEMAS, getApiKeyProviderSchema } from './providerSchemas'
import type { ApiKeyProviderDraftMap } from './providerTypes'
import { SettingsPanelLayout, SettingsSection } from '../shared/SettingsPanelPrimitives'

interface ProvidersSettingsPanelProps {
  activeOperation: string | null
  errorMessage: string | null
  isLoading: boolean
  onConnectCodexWithOAuth: () => Promise<boolean>
  onRemoveApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<boolean>
  onSaveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<boolean>
  providersState: ProvidersState | null
}

type ExpandedProviderId = ApiKeyProviderId | 'codex' | null
type ProviderValidationErrors = Partial<Record<ApiKeyProviderId, string>>

const PRIMARY_BUTTON_CLASS_NAME =
  'h-10 rounded-xl border border-[#d8d8d8] bg-white px-3.5 text-sm font-medium text-black transition-[background-color,border-color,box-shadow,transform,color] duration-150 hover:border-[#b8b8b8] hover:bg-[#e7e7e7] hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-white disabled:border-[#d8d8d8] disabled:text-black/55'

export function ProvidersSettingsPanel({
  activeOperation,
  errorMessage,
  isLoading,
  onConnectCodexWithOAuth,
  onRemoveApiKeyProvider,
  onSaveApiKeyProvider,
  providersState,
}: ProvidersSettingsPanelProps) {
  const [expandedProviderId, setExpandedProviderId] = useState<ExpandedProviderId>('codex')
  const [providerDrafts, setProviderDrafts] = useState<ApiKeyProviderDraftMap>(() => buildInitialDraftMap())
  const [validationErrors, setValidationErrors] = useState<ProviderValidationErrors>({})

  useEffect(() => {
    setProviderDrafts((currentValue) => {
      const fallbackDraftMap = buildInitialDraftMap()
      const providerStatuses = providersState?.apiKeyProviders ?? []
      const providerStatusById = providerStatuses.reduce<Partial<Record<ApiKeyProviderId, (typeof providerStatuses)[number]>>>(
        (result, provider) => {
        result[provider.id] = provider
        return result
      },
        {},
      )
      const nextValue = { ...currentValue }

      for (const schema of API_KEY_PROVIDER_SCHEMAS) {
        const existingDraft = nextValue[schema.id]
        const fallbackDraft = fallbackDraftMap[schema.id]
        const providerStatus = providerStatusById[schema.id]

        nextValue[schema.id] = {
          apiKey: existingDraft?.apiKey ?? fallbackDraft.apiKey,
          baseUrl: providerStatus?.baseUrl ?? existingDraft?.baseUrl ?? fallbackDraft.baseUrl,
          maxTokens: existingDraft?.maxTokens ?? fallbackDraft.maxTokens,
          temperature: existingDraft?.temperature ?? fallbackDraft.temperature,
        }
      }

      return nextValue
    })
  }, [providersState])

  const codexStatus = providersState?.codex
  const apiKeyProviderStatusById = useMemo(() => {
    const statuses = providersState?.apiKeyProviders ?? []
    return statuses.reduce<Partial<Record<ApiKeyProviderId, (typeof statuses)[number]>>>((result, provider) => {
      result[provider.id] = provider
      return result
    }, {})
  }, [providersState?.apiKeyProviders])

  const isCodexConnecting = activeOperation === 'codex:connect'
  const codexBusy = isLoading || isCodexConnecting

  async function handleCodexAction() {
    if (codexBusy) {
      return
    }

    await onConnectCodexWithOAuth()
  }

  function setProviderValidationError(providerId: ApiKeyProviderId, message: string | null) {
    setValidationErrors((currentValue) => ({
      ...currentValue,
      [providerId]: message ?? undefined,
    }))
  }

  function updateProviderDraft(providerId: ApiKeyProviderId, input: Partial<ApiKeyProviderDraftMap[ApiKeyProviderId]>) {
    setProviderDrafts((currentValue) => ({
      ...currentValue,
      [providerId]: {
        ...currentValue[providerId],
        ...input,
      },
    }))
    setProviderValidationError(providerId, null)
  }

  function persistAdvancedDefaults(providerId: ApiKeyProviderId) {
    const currentDefaults = readProviderDefaults()
    const draft = providerDrafts[providerId]
    writeProviderDefaults({
      ...currentDefaults,
      [providerId]: {
        maxTokens: draft.maxTokens,
        temperature: draft.temperature,
      },
    })
  }

  async function handleSaveProvider(providerId: ApiKeyProviderId) {
    const schema = getApiKeyProviderSchema(providerId)
    if (!schema) {
      return
    }

    const draft = providerDrafts[providerId]
    const apiKey = draft.apiKey.trim()
    const inputBaseUrl = draft.baseUrl.trim()
    const fallbackBaseUrl = apiKeyProviderStatusById[providerId]?.baseUrl?.trim() ?? ''
    const hasStoredApiKey = Boolean(apiKeyProviderStatusById[providerId]?.hasApiKey)
    const resolvedBaseUrl = inputBaseUrl || fallbackBaseUrl

    if (!schema.apiKeyOptional && !apiKey && !hasStoredApiKey) {
      setProviderValidationError(providerId, 'API key is required for this provider.')
      return
    }

    if (schema.showBaseUrl && schema.baseUrlRequired && !resolvedBaseUrl) {
      setProviderValidationError(providerId, 'Base URL is required for this provider.')
      return
    }

    if (
      schema.showAdvancedDefaults &&
      (!isValidTemperature(draft.temperature) || !isValidMaxTokens(draft.maxTokens))
    ) {
      setProviderValidationError(
        providerId,
        'Temperature must be between 0 and 2, and Max Tokens must be a positive number.',
      )
      return
    }

    const didSave = await onSaveApiKeyProvider({
      apiKey,
      baseUrl: schema.showBaseUrl ? resolvedBaseUrl : undefined,
      providerId,
    })

    if (didSave && schema.showAdvancedDefaults) {
      persistAdvancedDefaults(providerId)
    }

    if (didSave) {
      setProviderDrafts((currentValue) => ({
        ...currentValue,
        [providerId]: {
          ...currentValue[providerId],
          apiKey: '',
          baseUrl: resolvedBaseUrl,
        },
      }))
    }
  }

  async function handleClearProvider(providerId: ApiKeyProviderId) {
    const didClear = await onRemoveApiKeyProvider(providerId)
    if (!didClear) {
      return
    }

    const fallbackDraftMap = buildInitialDraftMap()
    setProviderDrafts((currentValue) => ({
      ...currentValue,
      [providerId]: fallbackDraftMap[providerId],
    }))
    setProviderValidationError(providerId, null)
  }

  return (
    <SettingsPanelLayout title="Providers">
      <SettingsSection title="Provider Setup">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <CodexProviderAccordion
            accountId={codexStatus?.accountId ?? null}
            email={codexStatus?.email ?? null}
            isAuthenticated={Boolean(codexStatus?.isAuthenticated)}
            isBusy={codexBusy}
            isConnecting={isCodexConnecting}
            isExpanded={expandedProviderId === 'codex'}
            isFirst
            onAction={handleCodexAction}
            onToggle={() => setExpandedProviderId((currentValue) => (currentValue === 'codex' ? null : 'codex'))}
            primaryButtonClassName={PRIMARY_BUTTON_CLASS_NAME}
          />

          {API_KEY_PROVIDER_SCHEMAS.map((schema) => {
            const operationState = operationForProvider(activeOperation, schema.id)
            const isBusy = isLoading || operationState.isRemoving || operationState.isSaving
            const draft = providerDrafts[schema.id]
            const providerStatus = apiKeyProviderStatusById[schema.id]

            return (
              <ApiKeyProviderAccordion
                key={schema.id}
                draft={draft}
                errorMessage={validationErrors[schema.id]}
                isBusy={isBusy}
                isClearing={operationState.isRemoving}
                isExpanded={expandedProviderId === schema.id}
                isFirst={false}
                isSaving={operationState.isSaving}
                onBaseUrlChange={(value) => updateProviderDraft(schema.id, { baseUrl: value })}
                onClear={() => handleClearProvider(schema.id)}
                onMaxTokensChange={(value) => updateProviderDraft(schema.id, { maxTokens: normalizeOptionalIntegerInput(value) })}
                onSave={() => handleSaveProvider(schema.id)}
                onTemperatureChange={(value) => updateProviderDraft(schema.id, { temperature: normalizeOptionalNumericInput(value) })}
                onToggle={() =>
                  setExpandedProviderId((currentValue) => (currentValue === schema.id ? null : schema.id))
                }
                onUpdateApiKey={(value) => updateProviderDraft(schema.id, { apiKey: value })}
                primaryButtonClassName={PRIMARY_BUTTON_CLASS_NAME}
                providerStatus={providerStatus}
                schema={schema}
              />
            )
          })}
        </div>
      </SettingsSection>

      {errorMessage ? (
        <section className="rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
          {errorMessage}
        </section>
      ) : null}
    </SettingsPanelLayout>
  )
}
