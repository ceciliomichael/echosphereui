import { GeneralSettingsPanel } from './general/GeneralSettingsPanel'
import { ModelsSettingsPanel } from './models/ModelsSettingsPanel'
import { ProvidersSettingsPanel } from './providers/ProvidersSettingsPanel'
import { SettingsPlaceholderPanel } from './SettingsPlaceholderPanel'
import { getSettingsItem, type SettingsItemId } from './settingsItems'
import type { AppAppearance, AppLanguage } from '../../lib/appSettings'
import type { AppSettingsSaveState } from '../../hooks/useAppSettings'
import type { AppSettings, ProvidersState, SaveApiKeyProviderInput } from '../../types/chat'

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
  modelsSettings: {
    isProvidersLoading: boolean
    providersState: ProvidersState | null
  }
  providersSettings: {
    activeOperation: string | null
    errorMessage: string | null
    isLoading: boolean
    onConnectCodexWithOAuth: () => Promise<boolean>
    onSaveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<boolean>
    providersState: ProvidersState | null
  }
}

export function SettingsContent({ activeItemId, generalSettings, modelsSettings, providersSettings }: SettingsContentProps) {
  const activeItem = getSettingsItem(activeItemId)

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
      {activeItemId === 'settings-item1' ? (
        <GeneralSettingsPanel {...generalSettings} />
      ) : activeItemId === 'settings-item2' ? (
        <ProvidersSettingsPanel {...providersSettings} />
      ) : activeItemId === 'settings-item3' ? (
        <ModelsSettingsPanel {...modelsSettings} />
      ) : (
        <SettingsPlaceholderPanel item={activeItem} />
      )}
    </div>
  )
}
