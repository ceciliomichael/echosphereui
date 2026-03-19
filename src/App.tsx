import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiffPanelScope } from './components/chat/ConversationDiffPanel'
import { ChatInterface, type RightPanelTab } from './pages/ChatInterface'
import { SettingsInterface } from './pages/SettingsInterface'
import { useAppSettings } from './hooks/useAppSettings'
import { useChatMessages } from './hooks/useChatMessages'
import { useDocumentTheme } from './hooks/useDocumentTheme'
import { useProvidersState } from './hooks/useProvidersState'

type AppScreen = 'chat' | 'settings'
const CLEAR_LAST_ACTIVE_CONVERSATION_REQUEST = '__clear_last_active_conversation__'

export default function App() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('chat')
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('diff')
  const [diffPanelSelectedScope, setDiffPanelSelectedScope] = useState<DiffPanelScope>('unstaged')
  const [diffPanelExpandedFilePaths, setDiffPanelExpandedFilePaths] = useState<string[]>([])
  const { isLoading, saveState, settings, updateSettings } = useAppSettings()
  const providersState = useProvidersState()
  const [diffPanelWidth, setDiffPanelWidth] = useState(settings.diffPanelWidth)
  const [bootPreferredConversationId, setBootPreferredConversationId] = useState<string | null | undefined>(undefined)
  const persistingConversationIdRef = useRef<string | null>(null)
  const chatMessages = useChatMessages({
    language: settings.language,
    persistRevertEditSessionsByConversation: (nextValue) => {
      void updateSettings({ revertEditSessionsByConversation: nextValue })
    },
    preferredConversationId: bootPreferredConversationId ?? null,
    revertEditSessionsByConversation: settings.revertEditSessionsByConversation,
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

  const resolvedTheme = useDocumentTheme(settings.appearance)

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

  return (
    <div className="relative h-screen w-screen">
      <ChatInterface
        chatMessages={chatMessages}
        diffPanelWidth={diffPanelWidth}
        diffPanelExpandedFilePaths={diffPanelExpandedFilePaths}
        diffPanelSelectedScope={diffPanelSelectedScope}
        isActiveScreen={activeScreen === 'chat'}
        isRightPanelOpen={isRightPanelOpen}
        rightPanelTab={rightPanelTab}
        onDiffPanelExpandedFilePathsChange={setDiffPanelExpandedFilePaths}
        onRightPanelOpenChange={setIsRightPanelOpen}
        onRightPanelTabChange={setRightPanelTab}
        onDiffPanelSelectedScopeChange={setDiffPanelSelectedScope}
        onDiffPanelWidthChange={handleDiffPanelWidthChange}
        onDiffPanelWidthCommit={handleDiffPanelWidthCommit}
        resolvedTheme={resolvedTheme}
        settings={settings}
        onUpdateSettings={updateSettings}
        onSidebarWidthChange={handleSidebarWidthChange}
        sendMessageOnEnter={settings.sendMessageOnEnter}
        sidebarWidth={settings.sidebarWidth}
        onOpenSettings={() => setActiveScreen('settings')}
        providersState={{
          isLoading: providersState.isLoading,
          providersState: providersState.providersState,
        }}
      />

      {activeScreen === 'settings' ? (
        <div className="absolute inset-0 z-50">
          <SettingsInterface
            settings={settings}
            isSettingsLoading={isLoading}
            settingsSaveState={saveState}
            onBackToApp={() => setActiveScreen('chat')}
            onSidebarWidthChange={handleSidebarWidthChange}
            onUpdateSettings={updateSettings}
            providersState={{
              activeOperation: providersState.activeOperation,
              addCodexAccountWithOAuth: providersState.addCodexAccountWithOAuth,
              connectCodexWithOAuth: providersState.connectCodexWithOAuth,
              errorMessage: providersState.errorMessage,
              isLoading: providersState.isLoading,
              onRemoveApiKeyProvider: providersState.removeApiKeyProvider,
              onRefreshProvidersState: providersState.refreshInBackground,
              onSaveApiKeyProvider: providersState.saveApiKeyProvider,
              onSwitchCodexAccount: providersState.switchCodexAccount,
              providersState: providersState.providersState,
            }}
            sidebarWidth={settings.sidebarWidth}
          />
        </div>
      ) : null}
    </div>
  )
}
