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

interface SettingsInterfaceProps {
  onBackToApp: () => void
}

export function SettingsInterface({ onBackToApp }: SettingsInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [activeItemId, setActiveItemId] = useState<SettingsItemId>(DEFAULT_SETTINGS_ITEM_ID)

  useWorkspaceKeyboardShortcuts({
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
  })

  const activeItemLabel = getSettingsItem(activeItemId).label

  return (
    <AppWorkspaceShell
      isSidebarOpen={isSidebarOpen}
      sidebar={
        <SettingsSidebarPanel
          activeItemId={activeItemId}
          onBackToApp={onBackToApp}
          onSelectItem={setActiveItemId}
          onToggleSidebar={() => setIsSidebarOpen(false)}
        />
      }
    >
      <WorkspacePanel isSidebarOpen={isSidebarOpen}>
        <WorkspaceHeader
          title={activeItemLabel}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
          openSidebarLabel="Open settings navigation"
        />
        <SettingsContent activeItemId={activeItemId} />
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
