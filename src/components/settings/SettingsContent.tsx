import { GeneralSettingsPanel } from './general/GeneralSettingsPanel'
import { SettingsPlaceholderPanel } from './SettingsPlaceholderPanel'
import { getSettingsItem, type SettingsItemId } from './settingsItems'
import type { AppAppearance, AppLanguage } from '../../lib/appSettings'
import type { AppSettingsSaveState } from '../../hooks/useAppSettings'
import type { AppSettings } from '../../types/chat'

interface GeneralSettingsViewModel {
  isLoading: boolean
  onUpdateSettings: (input: Partial<AppSettings>) => void
  saveState: AppSettingsSaveState
  settings: {
    appearance: AppAppearance
    language: AppLanguage
    sendMessageOnEnter: boolean
  }
}

interface SettingsContentProps {
  activeItemId: SettingsItemId
  generalSettings: GeneralSettingsViewModel
}

export function SettingsContent({ activeItemId, generalSettings }: SettingsContentProps) {
  const activeItem = getSettingsItem(activeItemId)

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
      {activeItemId === 'settings-item1' ? (
        <GeneralSettingsPanel {...generalSettings} />
      ) : (
        <SettingsPlaceholderPanel item={activeItem} />
      )}
    </div>
  )
}
