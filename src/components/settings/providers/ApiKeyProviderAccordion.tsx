import type { ApiKeyProviderStatus } from '../../../types/chat'
import { ProviderAccordionItem } from './ProviderAccordionItem'
import type { ApiKeyProviderSchema } from './providerSchemas'
import type { ApiKeyProviderDraft } from './providerTypes'

export type ProviderActionFeedbackTone = 'success' | 'error'

export interface ProviderActionFeedback {
  label: string
  tone: ProviderActionFeedbackTone
}

interface ApiKeyProviderAccordionProps {
  actionFeedback: ProviderActionFeedback | null
  draft: ApiKeyProviderDraft
  errorMessage: string | undefined
  isBusy: boolean
  isExpanded: boolean
  isFirst?: boolean
  onBaseUrlChange: (value: string) => void
  onClear: () => Promise<void>
  onMaxTokensChange: (value: string) => void
  onSave: () => Promise<void>
  onTemperatureChange: (value: string) => void
  onToggle: () => void
  onUpdateApiKey: (value: string) => void
  primaryButtonClassName: string
  providerStatus: ApiKeyProviderStatus | undefined
  schema: ApiKeyProviderSchema
}

const feedbackBadgeClassNameByTone: Record<ProviderActionFeedbackTone, string> = {
  error: 'border border-danger-border bg-danger-surface text-danger-foreground',
  success: 'border border-accent bg-accent-soft text-accent-foreground',
}

export function ApiKeyProviderAccordion({
  actionFeedback,
  draft,
  errorMessage,
  isBusy,
  isExpanded,
  isFirst = false,
  onBaseUrlChange,
  onClear,
  onMaxTokensChange,
  onSave,
  onTemperatureChange,
  onToggle,
  onUpdateApiKey,
  primaryButtonClassName,
  providerStatus,
  schema,
}: ApiKeyProviderAccordionProps) {
  const statusLabel = providerStatus?.configured ? 'Configured' : 'Not Configured'
  const hasStoredApiKey = Boolean(providerStatus?.hasApiKey)

  return (
    <ProviderAccordionItem
      title={schema.label}
      description={schema.description}
      statusLabel={statusLabel}
      statusTone={providerStatus?.configured ? 'active' : 'inactive'}
      isExpanded={isExpanded}
      isFirst={isFirst}
      onToggle={onToggle}
      actions={null}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <label htmlFor={`${schema.id}-api-key`} className="text-sm font-medium text-foreground">
            API Key {schema.apiKeyOptional ? '(optional)' : ''}
          </label>
          <input
            id={`${schema.id}-api-key`}
            type="password"
            value={draft.apiKey}
            onChange={(event) => onUpdateApiKey(event.target.value)}
            placeholder={
              hasStoredApiKey ? 'Stored locally. Enter a new API key to rotate.' : 'Paste API key'
            }
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
            required={!schema.apiKeyOptional}
          />
          {hasStoredApiKey ? (
            <p className="text-xs text-muted-foreground">Leave this blank to keep the saved API key.</p>
          ) : schema.apiKeyOptional ? (
            <p className="text-xs text-muted-foreground">
              Optional. Leave this blank if your endpoint does not require authentication.
            </p>
          ) : null}
        </div>

        {schema.showBaseUrl ? (
          <div className="space-y-2">
            <label htmlFor={`${schema.id}-base-url`} className="text-sm font-medium text-foreground">
              {schema.baseUrlLabel} {schema.baseUrlRequired ? '' : '(optional)'}
            </label>
            <input
              id={`${schema.id}-base-url`}
              type="url"
              value={draft.baseUrl}
              onChange={(event) => onBaseUrlChange(event.target.value)}
              placeholder={schema.defaultBaseUrl}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
              required={schema.baseUrlRequired}
            />
          </div>
        ) : null}

        {schema.showAdvancedDefaults ? (
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium text-foreground">Response Settings</p>
            <p className="mt-1 text-xs text-muted-foreground">Set how this provider should answer by default.</p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`${schema.id}-temperature`} className="text-sm font-medium text-foreground">
                  Temperature (0-2)
                </label>
                <input
                  id={`${schema.id}-temperature`}
                  type="text"
                  inputMode="decimal"
                  value={draft.temperature}
                  onChange={(event) => onTemperatureChange(event.target.value)}
                  placeholder="e.g. 0.7"
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`${schema.id}-max-tokens`} className="text-sm font-medium text-foreground">
                  Max Tokens
                </label>
                <input
                  id={`${schema.id}-max-tokens`}
                  type="text"
                  inputMode="numeric"
                  value={draft.maxTokens}
                  onChange={(event) => onMaxTokensChange(event.target.value)}
                  placeholder="e.g. 4096"
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none"
                />
              </div>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {actionFeedback ? (
            <span
              role="status"
              aria-live="polite"
              className={[
                'inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium',
                feedbackBadgeClassNameByTone[actionFeedback.tone],
              ].join(' ')}
            >
              {actionFeedback.label}
            </span>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {providerStatus?.configured ? (
              <button
                type="button"
                onClick={() => void onClear()}
                disabled={isBusy}
                className={primaryButtonClassName}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={isBusy}
              className={primaryButtonClassName}
            >
              {providerStatus?.configured ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </ProviderAccordionItem>
  )
}
