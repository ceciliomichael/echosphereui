import { GeneralSettingsPanel } from './general/GeneralSettingsPanel'
import { McpServersSettingsPanel } from './mcp/McpServersSettingsPanel'
import { ModelsSettingsPanel } from './models/ModelsSettingsPanel'
import { ProvidersSettingsPanel } from './providers/ProvidersSettingsPanel'
import { SettingsPlaceholderPanel } from './SettingsPlaceholderPanel'
import { getSettingsItem, type SettingsItemId } from './settingsItems'
import type { AppAppearance, AppLanguage } from '../../lib/appSettings'
import type { AppSettingsSaveState } from '../../hooks/useAppSettings'
import type { ApiKeyProviderId, AppSettings, ProvidersState, SaveApiKeyProviderInput } from '../../types/chat'
import type { McpAddServerInput, McpState } from '../../types/mcp'

interface GeneralSettingsViewModel {
  isLoading: boolean
  onUpdateSettings: (input: Partial<AppSettings>) => void
  saveState: AppSettingsSaveState
  settings: {
    appearance: AppAppearance
    language: AppLanguage
    sendMessageOnEnter: boolean
    workspaceFileEditorWordWrap: boolean
  }
}

interface SettingsContentProps {
  activeItemId: SettingsItemId
  generalSettings: GeneralSettingsViewModel
  mcpSettings: {
    activeOperation: string | null
    onAddServer: (input: McpAddServerInput) => Promise<boolean>
    errorMessage: string | null
    isLoading: boolean
    onConnectServer: (serverId: string) => Promise<boolean>
    onDisconnectServer: (serverId: string) => Promise<boolean>
    onRemoveServer: (serverId: string) => Promise<boolean>
    onUpdateServer: (serverId: string, input: McpAddServerInput) => Promise<boolean>
    onToggleTool: (serverId: string, toolName: string, enabled: boolean) => Promise<boolean>
    state: McpState | null
  }
  modelsSettings: {
    providersState: ProvidersState | null
  }
  providersSettings: {
    activeOperation: string | null
    errorMessage: string | null
    isLoading: boolean
    onAddCodexAccountWithOAuth: () => Promise<boolean>
    onConnectCodexWithOAuth: () => Promise<boolean>
    onDisconnectCodex: () => Promise<boolean>
    onRemoveApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<boolean>
    onRefreshProvidersState: () => Promise<void>
    onSaveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<boolean>
    onSwitchCodexAccount: (accountId: string) => Promise<boolean>
    providersState: ProvidersState | null
  }
}

export function SettingsContent({
  activeItemId,
  generalSettings,
  mcpSettings,
  modelsSettings,
  providersSettings,
}: SettingsContentProps) {
  const activeItem = getSettingsItem(activeItemId)

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
      {activeItemId === 'settings-item1' ? (
        <GeneralSettingsPanel {...generalSettings} />
      ) : activeItemId === 'settings-item2' ? (
        <ProvidersSettingsPanel {...providersSettings} />
      ) : activeItemId === 'settings-item3' ? (
        <ModelsSettingsPanel {...modelsSettings} />
      ) : activeItemId === 'settings-item4' ? (
        <McpServersSettingsPanel {...mcpSettings} />
      ) : (
        <SettingsPlaceholderPanel item={activeItem} />
      )}
    </div>
  )
}
