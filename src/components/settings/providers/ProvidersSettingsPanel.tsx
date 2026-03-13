import { useEffect, useMemo, useState } from 'react'
import type { ApiKeyProviderId, ProvidersState, SaveApiKeyProviderInput } from '../../../types/chat'
import { ApiKeyProviderAccordion, type ProviderActionFeedback } from './ApiKeyProviderAccordion'
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
import { PRIMARY_ACTION_BUTTON_CLASS_NAME } from '../shared/actionButtonStyles'

interface ProvidersSettingsPanelProps {
  activeOperation: string | null
  errorMessage: string | null
  isLoading: boolean
  onAddCodexAccountWithOAuth: () => Promise<boolean>
  onConnectCodexWithOAuth: () => Promise<boolean>
  onRemoveApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<boolean>
  onRefreshProvidersState: () => Promise<void>
  onSaveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<boolean>
  onSwitchCodexAccount: (accountId: string) => Promise<boolean>
  providersState: ProvidersState | null
}

type ExpandedProviderId = ApiKeyProviderId | 'codex' | null
type ProviderValidationErrors = Partial<Record<ApiKeyProviderId, string>>
type ProviderActionFeedbackMap = Partial<Record<ApiKeyProviderId, ProviderActionFeedback>>

export function ProvidersSettingsPanel({
  activeOperation,
  errorMessage,
  isLoading,
  onAddCodexAccountWithOAuth,
  onConnectCodexWithOAuth,
  onRemoveApiKeyProvider,
  onRefreshProvidersState,
  onSaveApiKeyProvider,
  onSwitchCodexAccount,
  providersState,
}: ProvidersSettingsPanelProps) {
  const [expandedProviderId, setExpandedProviderId] = useState<ExpandedProviderId>('codex')
  const [providerDrafts, setProviderDrafts] = useState<ApiKeyProviderDraftMap>(() => buildInitialDraftMap())
  const [validationErrors, setValidationErrors] = useState<ProviderValidationErrors>({})
  const [providerActionFeedback, setProviderActionFeedback] = useState<ProviderActionFeedbackMap>({})

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
  const isCodexAddingAccount = activeOperation === 'codex:add-account'
  const isCodexSwitchingAccount = Boolean(activeOperation?.startsWith('codex:switch:'))
  const codexBusy = isLoading || isCodexConnecting || isCodexAddingAccount || isCodexSwitchingAccount
  const codexIsAuthenticated = Boolean(codexStatus?.isAuthenticated)
  const codexAccountCount = codexStatus?.accounts.length ?? 0

  async function handleCodexConnect() {
    if (codexBusy) {
      return
    }

    await onConnectCodexWithOAuth()
  }

  async function handleCodexAddAccount() {
    if (codexBusy) {
      return
    }

    await onAddCodexAccountWithOAuth()
  }

  async function handleCodexSwitchAccount(accountId: string) {
    if (codexBusy) {
      return
    }

    await onSwitchCodexAccount(accountId)
  }

  useEffect(() => {
    if (expandedProviderId !== 'codex') {
      return
    }

    if (!codexIsAuthenticated && codexAccountCount === 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      if (codexBusy) {
        return
      }

      void onRefreshProvidersState()
    }, 30_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    codexBusy,
    codexAccountCount,
    codexIsAuthenticated,
    expandedProviderId,
    onRefreshProvidersState,
  ])

  function setProviderValidationError(providerId: ApiKeyProviderId, message: string | null) {
    setValidationErrors((currentValue) => ({
      ...currentValue,
      [providerId]: message ?? undefined,
    }))
  }

  function setProviderFeedback(providerId: ApiKeyProviderId, feedback: ProviderActionFeedback | null) {
    setProviderActionFeedback((currentValue) => {
      const previousFeedback = currentValue[providerId]
      const nextFeedback = feedback ?? undefined

      if (
        previousFeedback?.label === nextFeedback?.label &&
        previousFeedback?.tone === nextFeedback?.tone
      ) {
        return currentValue
      }

      return {
        ...currentValue,
        [providerId]: nextFeedback,
      }
    })
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
    setProviderFeedback(providerId, null)
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
    const wasConfigured = Boolean(apiKeyProviderStatusById[providerId]?.configured)
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

    if (!didSave) {
      setProviderFeedback(providerId, { label: 'Save failed', tone: 'error' })
      return
    }

    setProviderFeedback(providerId, { label: wasConfigured ? 'Updated' : 'Saved', tone: 'success' })

    if (schema.showAdvancedDefaults) {
      persistAdvancedDefaults(providerId)
    }

    setProviderDrafts((currentValue) => ({
      ...currentValue,
      [providerId]: {
        ...currentValue[providerId],
        apiKey: '',
        baseUrl: resolvedBaseUrl,
      },
    }))
  }

  async function handleClearProvider(providerId: ApiKeyProviderId) {
    const didClear = await onRemoveApiKeyProvider(providerId)
    if (!didClear) {
      setProviderFeedback(providerId, { label: 'Clear failed', tone: 'error' })
      return
    }

    const fallbackDraftMap = buildInitialDraftMap()
    setProviderDrafts((currentValue) => ({
      ...currentValue,
      [providerId]: fallbackDraftMap[providerId],
    }))
    setProviderValidationError(providerId, null)
    setProviderFeedback(providerId, { label: 'Cleared', tone: 'success' })
  }

  return (
    <SettingsPanelLayout title="Providers">
      <SettingsSection title="Provider Setup">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <CodexProviderAccordion
            accountId={codexStatus?.accountId ?? null}
            accounts={codexStatus?.accounts ?? []}
            email={codexStatus?.email ?? null}
            isAuthenticated={Boolean(codexStatus?.isAuthenticated)}
            isBusy={codexBusy}
            isAddingAccount={isCodexAddingAccount}
            isConnecting={isCodexConnecting}
            isExpanded={expandedProviderId === 'codex'}
            isFirst
            onAddAccount={handleCodexAddAccount}
            onConnect={handleCodexConnect}
            onSwitchAccount={handleCodexSwitchAccount}
            onToggle={() => setExpandedProviderId((currentValue) => (currentValue === 'codex' ? null : 'codex'))}
            primaryButtonClassName={PRIMARY_ACTION_BUTTON_CLASS_NAME}
          />

          {API_KEY_PROVIDER_SCHEMAS.map((schema) => {
            const operationState = operationForProvider(activeOperation, schema.id)
            const isBusy = isLoading || operationState.isRemoving || operationState.isSaving
            const draft = providerDrafts[schema.id]
            const providerStatus = apiKeyProviderStatusById[schema.id]

            return (
              <ApiKeyProviderAccordion
                key={schema.id}
                actionFeedback={providerActionFeedback[schema.id] ?? null}
                draft={draft}
                errorMessage={validationErrors[schema.id]}
                isBusy={isBusy}
                isExpanded={expandedProviderId === schema.id}
                isFirst={false}
                onBaseUrlChange={(value) => updateProviderDraft(schema.id, { baseUrl: value })}
                onClear={() => handleClearProvider(schema.id)}
                onMaxTokensChange={(value) => updateProviderDraft(schema.id, { maxTokens: normalizeOptionalIntegerInput(value) })}
                onSave={() => handleSaveProvider(schema.id)}
                onTemperatureChange={(value) => updateProviderDraft(schema.id, { temperature: normalizeOptionalNumericInput(value) })}
                onToggle={() =>
                  setExpandedProviderId((currentValue) => (currentValue === schema.id ? null : schema.id))
                }
                onUpdateApiKey={(value) => updateProviderDraft(schema.id, { apiKey: value })}
                primaryButtonClassName={PRIMARY_ACTION_BUTTON_CLASS_NAME}
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
