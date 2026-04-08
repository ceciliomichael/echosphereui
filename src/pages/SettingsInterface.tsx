import { useState } from 'react'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspaceHeader } from '../components/layout/WorkspaceHeader'
import { WorkspaceFloatingControls } from '../components/layout/WorkspaceFloatingControls'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SettingsContent } from '../components/settings/SettingsContent'
import { SettingsSidebarPanel } from '../components/settings/SettingsSidebarPanel'
import {
  DEFAULT_SETTINGS_ITEM_ID,
  getSettingsItem,
  type SettingsItemId,
} from '../components/settings/settingsItems'
import { useMcpServersState } from '../hooks/useMcpServersState'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useWorkspaceKeyboardShortcuts'
import type { AppSettingsSaveState } from '../hooks/useAppSettings'
import type { AppSettings, ApiKeyProviderId, ProvidersState, SaveApiKeyProviderInput } from '../types/chat'

interface SettingsInterfaceProps {
  activeWorkspacePath: string | null
  isSettingsLoading: boolean
  onBackToApp: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  sidebarWidth: number
  settings: AppSettings
  settingsSaveState: AppSettingsSaveState
  providersState: {
    activeOperation: string | null
    addCodexAccountWithOAuth: () => Promise<boolean>
    connectCodexWithOAuth: () => Promise<boolean>
    disconnectCodex: () => Promise<boolean>
    errorMessage: string | null
    isLoading: boolean
    onRemoveApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<boolean>
    onRefreshProvidersState: () => Promise<void>
    onSaveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<boolean>
    onSwitchCodexAccount: (accountId: string) => Promise<boolean>
    providersState: ProvidersState | null
  }
}

export function SettingsInterface({
  activeWorkspacePath,
  isSettingsLoading,
  onBackToApp,
  onSidebarWidthChange,
  onUpdateSettings,
  providersState,
  sidebarWidth,
  settings,
  settingsSaveState,
}: SettingsInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [activeItemId, setActiveItemId] = useState<SettingsItemId>(DEFAULT_SETTINGS_ITEM_ID)
  const mcpSettings = useMcpServersState(activeWorkspacePath)

  useWorkspaceKeyboardShortcuts({
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
  })

  const activeItemLabel = getSettingsItem(activeItemId).label

  return (
    <AppWorkspaceShell
      isSidebarOpen={isSidebarOpen}
      onSidebarWidthChange={onSidebarWidthChange}
      floatingControls={
        <WorkspaceFloatingControls
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
        />
      }
      sidebar={
        <SettingsSidebarPanel
          activeItemId={activeItemId}
          onBackToApp={onBackToApp}
          onSelectItem={setActiveItemId}
        />
      }
      sidebarWidth={sidebarWidth}
    >
      <WorkspacePanel isSidebarOpen={isSidebarOpen} showRightBorder={false}>
        <WorkspaceHeader
          title={activeItemLabel}
          isSidebarOpen={isSidebarOpen}
          leadingPaddingClassName={isSidebarOpen ? '' : 'pl-[72px] md:pl-[76px]'}
        />
        <SettingsContent
          activeItemId={activeItemId}
          generalSettings={{
            isLoading: isSettingsLoading,
            onUpdateSettings: (input) => void onUpdateSettings(input),
            saveState: settingsSaveState,
            settings: {
              appearance: settings.appearance,
              language: settings.language,
              sendMessageOnEnter: settings.sendMessageOnEnter,
              workspaceFileEditorWordWrap: settings.workspaceFileEditorWordWrap,
            },
          }}
          mcpSettings={{
            activeOperation: mcpSettings.activeOperation,
            onAddServer: mcpSettings.addServer,
            errorMessage: mcpSettings.errorMessage,
            isLoading: mcpSettings.isLoading,
            onConnectServer: mcpSettings.connectServer,
            onDisconnectServer: mcpSettings.disconnectServer,
            onRemoveServer: mcpSettings.removeServer,
            onToggleTool: mcpSettings.toggleTool,
            state: mcpSettings.state,
          }}
          modelsSettings={{
            providersState: providersState.providersState,
          }}
          providersSettings={{
            activeOperation: providersState.activeOperation,
            errorMessage: providersState.errorMessage,
            isLoading: providersState.isLoading,
            onAddCodexAccountWithOAuth: providersState.addCodexAccountWithOAuth,
            onConnectCodexWithOAuth: providersState.connectCodexWithOAuth,
            onDisconnectCodex: providersState.disconnectCodex,
            onRemoveApiKeyProvider: providersState.onRemoveApiKeyProvider,
            onRefreshProvidersState: providersState.onRefreshProvidersState,
            onSaveApiKeyProvider: providersState.onSaveApiKeyProvider,
            onSwitchCodexAccount: providersState.onSwitchCodexAccount,
            providersState: providersState.providersState,
          }}
        />
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
