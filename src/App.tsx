import { useState } from 'react'
import { ChatInterface } from './pages/ChatInterface'
import { SettingsInterface } from './pages/SettingsInterface'
import { useAppSettings } from './hooks/useAppSettings'
import { useDocumentTheme } from './hooks/useDocumentTheme'

type AppScreen = 'chat' | 'settings'

export default function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('chat')
  const { isLoading, saveState, settings, updateSettings } = useAppSettings()
  const handleSidebarWidthChange = (sidebarWidth: number) => {
    void updateSettings({ sidebarWidth })
  }

  useDocumentTheme(settings.appearance)

  if (activeScreen === 'settings') {
    return (
      <SettingsInterface
        settings={settings}
        isSettingsLoading={isLoading}
        settingsSaveState={saveState}
        onBackToApp={() => setActiveScreen('chat')}
        onSidebarWidthChange={handleSidebarWidthChange}
        onUpdateSettings={updateSettings}
        sidebarWidth={settings.sidebarWidth}
      />
    )
  }

  return (
    <ChatInterface
      language={settings.language}
      onSidebarWidthChange={handleSidebarWidthChange}
      sendMessageOnEnter={settings.sendMessageOnEnter}
      sidebarWidth={settings.sidebarWidth}
      onOpenSettings={() => setActiveScreen('settings')}
    />
  )
}
