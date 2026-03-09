import type { ReactNode } from 'react'
import {
  APP_APPEARANCE_OPTIONS,
  APP_LANGUAGE_OPTIONS,
  isAppAppearance,
  isAppLanguage,
} from '../../../lib/appSettings'
import type { AppSettingsSaveState } from '../../../hooks/useAppSettings'
import type { AppAppearance, AppLanguage } from '../../../lib/appSettings'
import type { AppSettings } from '../../../types/chat'
import { DropdownField } from '../../ui/DropdownField'
import { SegmentedField } from '../../ui/SegmentedField'

const BOOLEAN_SEGMENT_OPTIONS = [
  { label: 'Off', value: 'off' },
  { label: 'On', value: 'on' },
] as const

interface GeneralSettingsPanelProps {
  isLoading: boolean
  onUpdateSettings: (input: Partial<AppSettings>) => void
  saveState: AppSettingsSaveState
  settings: {
    appearance: AppAppearance
    language: AppLanguage
    sendMessageOnEnter: boolean
  }
}

interface GeneralSettingRowProps {
  children: ReactNode
  description: string
  title: string
}

interface GeneralSettingsSectionProps {
  children: ReactNode
  title: string
}

function GeneralSettingRow({ children, description, title }: GeneralSettingRowProps) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 md:flex-row md:items-center md:justify-between md:gap-6 md:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground md:text-sm">{title}</p>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground md:text-sm">{description}</p>
      </div>

      {children}
    </div>
  )
}

function GeneralSettingsSection({ children, title }: GeneralSettingsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <header>
        <h3 className="text-[15px] font-medium text-foreground md:text-base">{title}</h3>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">{children}</div>
    </section>
  )
}

export function GeneralSettingsPanel({
  isLoading,
  onUpdateSettings,
  saveState,
  settings,
}: GeneralSettingsPanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col gap-5 py-3 md:py-4">
      <header className="pb-3">
        <h2 className="text-[21px] font-medium tracking-tight text-foreground md:text-[24px]">General</h2>
      </header>

      <GeneralSettingsSection title="Appearance">
        <GeneralSettingRow
          title="Theme"
          description="Choose the app theme or follow your system appearance automatically."
        >
          <SegmentedField
            ariaLabel="App appearance"
            value={settings.appearance}
            options={APP_APPEARANCE_OPTIONS}
            disabled={isLoading || saveState === 'saving'}
            onChange={(nextValue) => {
              if (isAppAppearance(nextValue)) {
                onUpdateSettings({ appearance: nextValue })
              }
            }}
          />
        </GeneralSettingRow>
      </GeneralSettingsSection>

      <GeneralSettingsSection title="Preferences">
        <GeneralSettingRow
          title="Language"
          description="Set the interface language used for date and time labels across the app."
        >
          <div className="w-full md:w-[240px]">
            <label htmlFor="general-language" className="sr-only">
              App language
            </label>
            <DropdownField
              id="general-language"
              ariaLabel="App language"
              value={settings.language}
              options={APP_LANGUAGE_OPTIONS}
              disabled={isLoading || saveState === 'saving'}
              className="w-full"
              onChange={(nextValue) => {
                if (isAppLanguage(nextValue)) {
                  onUpdateSettings({ language: nextValue })
                }
              }}
            />
          </div>
        </GeneralSettingRow>

        <div className="border-t border-border">
          <GeneralSettingRow
            title="Send on Enter"
            description="Press Enter to send messages. When off, use Ctrl+Enter or Cmd+Enter to send."
          >
            <SegmentedField
              ariaLabel="Send on Enter"
              value={settings.sendMessageOnEnter ? 'on' : 'off'}
              options={BOOLEAN_SEGMENT_OPTIONS}
              disabled={isLoading || saveState === 'saving'}
              onChange={(nextValue) => onUpdateSettings({ sendMessageOnEnter: nextValue === 'on' })}
            />
          </GeneralSettingRow>
        </div>
      </GeneralSettingsSection>
    </div>
  )
}
