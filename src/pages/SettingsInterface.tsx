import { useState } from 'react'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspaceHeader } from '../components/layout/WorkspaceHeader'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SettingsContent } from '../components/settings/SettingsContent'
import { SettingsSidebarPanel } from '../components/settings/SettingsSidebarPanel'
import {
  DEFAULT_SETTINGS_ITEM_ID,
  getSettingsItem,
  type SettingsItemId,
} from '../components/settings/settingsItems'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useWorkspaceKeyboardShortcuts'
import type { AppSettingsSaveState } from '../hooks/useAppSettings'
import type { AppSettings } from '../types/chat'

interface SettingsInterfaceProps {
  isSettingsLoading: boolean
  onBackToApp: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  sidebarWidth: number
  settings: AppSettings
  settingsSaveState: AppSettingsSaveState
}

export function SettingsInterface({
  isSettingsLoading,
  onBackToApp,
  onSidebarWidthChange,
  onUpdateSettings,
  sidebarWidth,
  settings,
  settingsSaveState,
}: SettingsInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [activeItemId, setActiveItemId] = useState<SettingsItemId>(DEFAULT_SETTINGS_ITEM_ID)

  useWorkspaceKeyboardShortcuts({
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
  })

  const activeItemLabel = getSettingsItem(activeItemId).label

  return (
    <AppWorkspaceShell
      isSidebarOpen={isSidebarOpen}
      onSidebarWidthChange={onSidebarWidthChange}
      sidebar={
        <SettingsSidebarPanel
          activeItemId={activeItemId}
          onBackToApp={onBackToApp}
          onSelectItem={setActiveItemId}
          onToggleSidebar={() => setIsSidebarOpen(false)}
        />
      }
      sidebarWidth={sidebarWidth}
    >
      <WorkspacePanel isSidebarOpen={isSidebarOpen} showRightBorder={false}>
        <WorkspaceHeader
          title={activeItemLabel}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
          openSidebarLabel="Open settings navigation"
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
            },
          }}
        />
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
