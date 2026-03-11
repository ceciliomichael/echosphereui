import { Trash2 } from 'lucide-react'
import type { ModelCatalogItem, ModelToggleState } from './modelTypes'
import { getStatusPillClassName } from '../shared/statusPillStyles'

interface ModelsProviderSectionProps {
  configured: boolean
  isProviderStateLoading: boolean
  isRemovingCustomModel: boolean
  models: ModelCatalogItem[]
  onRemoveCustomModel: (modelId: string) => Promise<void>
  providerDescription: string
  providerLabel: string
  toggleState: ModelToggleState
  onToggleModel: (modelId: string) => void
}

function getProviderStatusLabel(configured: boolean, isProviderStateLoading: boolean) {
  if (isProviderStateLoading) {
    return 'Checking'
  }

  return configured ? 'Configured' : 'Not configured'
}

interface ModelToggleControlProps {
  checked: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}

function ModelToggleControl({ checked, disabled, label, onToggle }: ModelToggleControlProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Enable ${label}`}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'relative h-6 w-11 rounded-full transition-colors focus:outline-none focus-visible:outline-none',
        checked ? 'bg-emerald-500' : 'bg-border',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <span
        className={[
          'absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

export function ModelsProviderSection({
  configured,
  isProviderStateLoading,
  isRemovingCustomModel,
  models,
  onRemoveCustomModel,
  providerDescription,
  providerLabel,
  toggleState,
  onToggleModel,
}: ModelsProviderSectionProps) {
  const statusLabel = getProviderStatusLabel(configured, isProviderStateLoading)
  const statusTone = configured && !isProviderStateLoading ? 'active' : 'inactive'
  const canToggleModels = configured && !isProviderStateLoading
  const enabledCount = models.reduce(
    (result, model) => ((toggleState[model.id] ?? model.enabledByDefault) ? result + 1 : result),
    0,
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 md:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-sm font-medium text-foreground md:text-[15px]">{providerLabel}</h4>
            <span className={getStatusPillClassName(statusTone)}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{providerDescription}</p>
        </div>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">{enabledCount} enabled</p>
      </header>

      <div className="border-t border-border">
        {models.map((model, index) => {
          const isEnabled = Boolean(toggleState[model.id] ?? model.enabledByDefault)

          return (
            <div
              key={model.id}
              className={[
                'flex items-center justify-between gap-3 px-4 py-3 md:px-5',
                index === 0 ? '' : 'border-t border-border',
                canToggleModels ? '' : 'opacity-60',
              ].join(' ')}
            >
              <div className="flex min-w-0 items-center gap-2">
                <p className="min-w-0 truncate text-sm text-foreground">{model.label}</p>
                {model.isCustom ? (
                  <span className="rounded-full bg-[#f3f0ff] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#6d5ed6]">
                    Custom
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {model.isCustom ? (
                  <button
                    type="button"
                    aria-label={`Remove ${model.label}`}
                    disabled={isRemovingCustomModel}
                    onClick={() => void onRemoveCustomModel(model.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
                <ModelToggleControl
                  checked={isEnabled}
                  disabled={!canToggleModels}
                  label={model.label}
                  onToggle={() => onToggleModel(model.id)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
