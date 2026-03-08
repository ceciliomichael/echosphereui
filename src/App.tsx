import { useState } from 'react'
import { ChatInterface } from './pages/ChatInterface'
import { SettingsInterface } from './pages/SettingsInterface'

type AppScreen = 'chat' | 'settings'

export default function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('chat')

  if (activeScreen === 'settings') {
    return <SettingsInterface onBackToApp={() => setActiveScreen('chat')} />
  }

  return <ChatInterface onOpenSettings={() => setActiveScreen('settings')} />
}
