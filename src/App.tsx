import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiffPanelScope } from './components/chat/ConversationDiffPanel'
import { ChatInterface } from './pages/ChatInterface'
import { SettingsInterface } from './pages/SettingsInterface'
import { useAppSettings } from './hooks/useAppSettings'
import { useChatMessages } from './hooks/useChatMessages'
import { useDocumentTheme } from './hooks/useDocumentTheme'

type AppScreen = 'chat' | 'settings'
const CLEAR_LAST_ACTIVE_CONVERSATION_REQUEST = '__clear_last_active_conversation__'

export default function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('chat')
  const [isDiffPanelOpen, setIsDiffPanelOpen] = useState(false)
  const [diffPanelSelectedScope, setDiffPanelSelectedScope] = useState<DiffPanelScope>('unstaged')
  const [diffPanelExpandedFilePaths, setDiffPanelExpandedFilePaths] = useState<string[]>([])
  const { isLoading, saveState, settings, updateSettings } = useAppSettings()
  const [diffPanelWidth, setDiffPanelWidth] = useState(settings.diffPanelWidth)
  const [bootPreferredConversationId, setBootPreferredConversationId] = useState<string | null | undefined>(undefined)
  const persistingConversationIdRef = useRef<string | null>(null)
  const chatMessages = useChatMessages({
    language: settings.language,
    preferredConversationId: bootPreferredConversationId ?? null,
    shouldInitializeHistory: bootPreferredConversationId !== undefined,
  })
  const handleSidebarWidthChange = useCallback((sidebarWidth: number) => {
    void updateSettings({ sidebarWidth })
  }, [updateSettings])
  const handleDiffPanelWidthChange = useCallback((nextWidth: number) => {
    setDiffPanelWidth(nextWidth)
  }, [])
  const handleDiffPanelWidthCommit = useCallback(
    (nextWidth: number) => {
      if (nextWidth === settings.diffPanelWidth) {
        return
      }

      void updateSettings({ diffPanelWidth: nextWidth })
    },
    [settings.diffPanelWidth, updateSettings],
  )

  useDocumentTheme(settings.appearance)

  useEffect(() => {
    setDiffPanelWidth(settings.diffPanelWidth)
  }, [settings.diffPanelWidth])

  useEffect(() => {
    if (isLoading || bootPreferredConversationId !== undefined) {
      return
    }

    setBootPreferredConversationId(settings.lastActiveConversationId)
  }, [bootPreferredConversationId, isLoading, settings.lastActiveConversationId])

  useEffect(() => {
    if (isLoading || chatMessages.isLoading) {
      return
    }

    const activeConversationId = chatMessages.activeConversationId
    if (!activeConversationId) {
      const hasStoredConversations = chatMessages.conversationGroups.some((group) => group.conversations.length > 0)
      if (hasStoredConversations || settings.lastActiveConversationId === null) {
        if (persistingConversationIdRef.current === CLEAR_LAST_ACTIVE_CONVERSATION_REQUEST) {
          persistingConversationIdRef.current = null
        }

        return
      }

      if (persistingConversationIdRef.current === CLEAR_LAST_ACTIVE_CONVERSATION_REQUEST) {
        return
      }

      persistingConversationIdRef.current = CLEAR_LAST_ACTIVE_CONVERSATION_REQUEST
      void updateSettings({ lastActiveConversationId: null }).finally(() => {
        if (persistingConversationIdRef.current === CLEAR_LAST_ACTIVE_CONVERSATION_REQUEST) {
          persistingConversationIdRef.current = null
        }
      })
      return
    }

    if (activeConversationId === settings.lastActiveConversationId) {
      if (persistingConversationIdRef.current === activeConversationId) {
        persistingConversationIdRef.current = null
      }

      return
    }

    if (persistingConversationIdRef.current === activeConversationId) {
      return
    }

    persistingConversationIdRef.current = activeConversationId
    void updateSettings({ lastActiveConversationId: activeConversationId }).finally(() => {
      if (persistingConversationIdRef.current === activeConversationId) {
        persistingConversationIdRef.current = null
      }
    })
  }, [
    chatMessages.activeConversationId,
    chatMessages.conversationGroups,
    chatMessages.isLoading,
    isLoading,
    settings.lastActiveConversationId,
    updateSettings,
  ])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--workspace-shell-surface)] px-4 text-sm text-subtle-foreground">
        Loading workspace...
      </div>
    )
  }

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
      chatMessages={chatMessages}
      diffPanelWidth={diffPanelWidth}
      diffPanelExpandedFilePaths={diffPanelExpandedFilePaths}
      diffPanelSelectedScope={diffPanelSelectedScope}
      isDiffPanelOpen={isDiffPanelOpen}
      onDiffPanelExpandedFilePathsChange={setDiffPanelExpandedFilePaths}
      onDiffPanelOpenChange={setIsDiffPanelOpen}
      onDiffPanelSelectedScopeChange={setDiffPanelSelectedScope}
      onDiffPanelWidthChange={handleDiffPanelWidthChange}
      onDiffPanelWidthCommit={handleDiffPanelWidthCommit}
      settings={settings}
      onUpdateSettings={updateSettings}
      onSidebarWidthChange={handleSidebarWidthChange}
      sendMessageOnEnter={settings.sendMessageOnEnter}
      sidebarWidth={settings.sidebarWidth}
      onOpenSettings={() => setActiveScreen('settings')}
    />
  )
}
