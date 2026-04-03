import { useMemo, useState } from 'react'
import type { ProvidersState } from '../../../types/chat'
import { DropdownField } from '../../ui/DropdownField'
import { SettingsPanelLayout } from '../shared/SettingsPanelPrimitives'

interface ModelsSettingsPanelProps {
  isProvidersLoading: boolean
  providersState: ProvidersState | null
}

export function ModelsSettingsPanel({ isProvidersLoading, providersState }: ModelsSettingsPanelProps) {
  const dropdownOptions = useMemo(() => {
    const providerCount = providersState?.apiKeyProviders.length ?? 0
    const codexConfigured = providersState?.codex.isAuthenticated ?? false

    return [
      {
        label: 'Backend Reset',
        value: 'backend-reset',
      },
      {
        label: `Configured providers: ${providerCount}${codexConfigured ? ' + codex' : ''}`,
        value: 'configured-summary',
      },
    ]
  }, [providersState])
  const [selectedValue, setSelectedValue] = useState('backend-reset')

  return (
    <SettingsPanelLayout title="Models">
      <section className="flex flex-col gap-3 pb-4 md:pb-5">
        <header>
          <h3 className="text-[15px] font-medium text-foreground md:text-base">Models</h3>
        </header>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This screen is intentionally reduced to one dropdown while the model backend is rebuilt.
          </p>

          <section className="rounded-2xl border border-border bg-surface p-4 md:p-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Model backend state</label>
              <DropdownField
                ariaLabel="Model backend state"
                value={selectedValue}
                onChange={setSelectedValue}
                options={dropdownOptions}
                disabled={isProvidersLoading}
              />
            </div>
          </section>
        </div>
      </section>
    </SettingsPanelLayout>
  )
}
