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
import { SettingsPanelLayout, SettingsRow, SettingsSection } from '../shared/SettingsPanelPrimitives'

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

export function GeneralSettingsPanel({
  isLoading,
  onUpdateSettings,
  saveState,
  settings,
}: GeneralSettingsPanelProps) {
  return (
    <SettingsPanelLayout title="General">
      <SettingsSection title="Appearance">
        <SettingsRow
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
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Preferences">
        <SettingsRow
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
        </SettingsRow>

        <div className="border-t border-border">
          <SettingsRow
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
          </SettingsRow>
        </div>
      </SettingsSection>
    </SettingsPanelLayout>
  )
}
