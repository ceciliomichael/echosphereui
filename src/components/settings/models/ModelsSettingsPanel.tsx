import { useEffect, useMemo, useState } from 'react'
import type { ProvidersState } from '../../../types/chat'
import { SettingsPanelLayout } from '../shared/SettingsPanelPrimitives'
import { ModelsProviderSection } from './ModelsProviderSection'
import { readStoredModelToggleState, writeStoredModelToggleState } from './modelStorage'
import type { ModelToggleState } from './modelTypes'
import { buildModelProviderSections } from './modelViewUtils'

interface ModelsSettingsPanelProps {
  isProvidersLoading: boolean
  providersState: ProvidersState | null
}

export function ModelsSettingsPanel({ isProvidersLoading, providersState }: ModelsSettingsPanelProps) {
  const [toggleState, setToggleState] = useState<ModelToggleState>(() => readStoredModelToggleState())

  useEffect(() => {
    writeStoredModelToggleState(toggleState)
  }, [toggleState])

  const providerSections = useMemo(() => buildModelProviderSections('', providersState), [providersState])

  function handleToggleModel(modelId: string) {
    setToggleState((currentValue) => ({
      ...currentValue,
      [modelId]: !currentValue[modelId],
    }))
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

          {providerSections.length > 0 ? (
            <div className="space-y-3">
              {providerSections.map((section) => (
                <ModelsProviderSection
                  key={section.provider.id}
                  configured={section.configured}
                  isProviderStateLoading={isProvidersLoading}
                  models={section.models}
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
