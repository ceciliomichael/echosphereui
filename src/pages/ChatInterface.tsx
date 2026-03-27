import { useEffect, useRef } from 'react'
import { ChatInterfaceContent } from './chatInterface/ChatInterfaceContent'
import { useChatRuntimeConfig } from '../hooks/useChatRuntimeConfig'
import type { ChatMessagesController } from '../hooks/useChatMessages'
import { useGitBranchState } from '../hooks/useGitBranchState'
import { useGitCommit } from '../hooks/useGitCommit'
import { useGitDiffSnapshot } from '../hooks/useGitDiffSnapshot'
import {
  useChatInterfaceController,
  type ChatInterfaceRightPanelTab,
} from '../hooks/useChatInterfaceController'
import { useChatWorkspaceUiState } from './chatInterface/useChatWorkspaceUiState'
import type { AppSettings, ProvidersState } from '../types/chat'
import type { DiffPanelScope } from '../components/chat/ConversationDiffPanel'
import type { ResolvedTheme } from '../lib/theme'

export type RightPanelTab = ChatInterfaceRightPanelTab

interface ChatInterfaceProps {
  chatMessages: ChatMessagesController
  diffPanelWidth: number
  isActiveScreen: boolean
  isRightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  diffPanelExpandedFilePaths: readonly string[]
  diffPanelSelectedScope: DiffPanelScope
  onRightPanelOpenChange: (nextValue: boolean) => void
  onRightPanelTabChange: (nextTab: RightPanelTab) => void
  onDiffPanelExpandedFilePathsChange: (nextFilePaths: string[]) => void
  onDiffPanelSelectedScopeChange: (nextScope: DiffPanelScope) => void
  onDiffPanelWidthChange: (nextWidth: number) => void
  onDiffPanelWidthCommit: (nextWidth: number) => void
  onOpenSettings: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  providersState: {
    isLoading: boolean
    providersState: ProvidersState | null
  }
  resolvedTheme: ResolvedTheme
  sendMessageOnEnter: boolean
  settings: AppSettings
  sidebarWidth: number
}

export function ChatInterface({
  chatMessages,
  diffPanelWidth,
  isActiveScreen,
  isRightPanelOpen,
  rightPanelTab,
  diffPanelExpandedFilePaths,
  diffPanelSelectedScope,
  onRightPanelOpenChange,
  onRightPanelTabChange,
  onDiffPanelExpandedFilePathsChange,
  onDiffPanelSelectedScopeChange,
  onDiffPanelWidthChange,
  onDiffPanelWidthCommit,
  onOpenSettings,
  onSidebarWidthChange,
  onUpdateSettings,
  providersState,
  resolvedTheme,
  sendMessageOnEnter,
  settings,
  sidebarWidth,
}: ChatInterfaceProps) {
  const chatRuntimeConfig = useChatRuntimeConfig({
    isActiveScreen,
    isProvidersLoading: providersState.isLoading,
    providersState: providersState.providersState,
    settings,
    updateSettings: onUpdateSettings,
  })
  const activeWorkspacePath = chatMessages.activeConversationRootPath ?? chatMessages.selectedFolderPath
  const gitBranchState = useGitBranchState(activeWorkspacePath)
  const hasRepository = gitBranchState.branchState.hasRepository
  const gitCommitState = useGitCommit({
    hasRepository,
    modelId: chatRuntimeConfig.selectedRuntimeModelId,
    providerId: chatRuntimeConfig.providerId,
    reasoningEffort: chatRuntimeConfig.reasoningEffort,
    workspacePath: activeWorkspacePath,
  })
  const gitDiffSnapshot = useGitDiffSnapshot({
    hasRepository,
    workspacePath: activeWorkspacePath,
  })
  const sidebarOpenChangeHandlerRef = useRef<(nextSidebarOpen: boolean) => void>(() => undefined)

  const interfaceController = useChatInterfaceController({
    activeTerminalWorkspaceKey: activeWorkspacePath?.trim() ?? '__global__',
    activeWorkspacePath,
    createConversation: chatMessages.createConversation,
    gitBranchState,
    gitCommitState,
    hasRepository,
    isActiveScreen,
    isRightPanelOpen,
    messagesLength: chatMessages.messages.length,
    onDiffRefresh: gitDiffSnapshot.refresh,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    onSidebarOpenChange: (nextSidebarOpen) => sidebarOpenChangeHandlerRef.current(nextSidebarOpen),
    onUpdateSettings,
    rightPanelTab,
    settings,
  })
  const workspaceState = useChatWorkspaceUiState({
    activeWorkspacePath,
    diffPanelWidth,
    isRightPanelOpen,
    isSidebarOpen: interfaceController.isSidebarOpen,
    onDiffPanelWidthChange,
    onDiffPanelWidthCommit,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    onUpdateSettings,
    rightPanelTab,
    setIsSidebarOpen: interfaceController.setIsSidebarOpen,
    settings,
  })

  useEffect(() => {
    sidebarOpenChangeHandlerRef.current = workspaceState.handleSidebarOpenChange
  }, [workspaceState.handleSidebarOpenChange])

  return (
    <ChatInterfaceContent
      chatMessages={chatMessages}
      chatRuntimeConfig={chatRuntimeConfig}
      diffPanelExpandedFilePaths={diffPanelExpandedFilePaths}
      diffPanelSelectedScope={diffPanelSelectedScope}
      gitBranchState={gitBranchState}
      gitCommitState={gitCommitState}
      gitDiffSnapshot={gitDiffSnapshot}
      interfaceController={interfaceController}
      onDiffPanelExpandedFilePathsChange={onDiffPanelExpandedFilePathsChange}
      onDiffPanelSelectedScopeChange={onDiffPanelSelectedScopeChange}
      onOpenSettings={onOpenSettings}
      onSidebarWidthChange={onSidebarWidthChange}
      resolvedTheme={resolvedTheme}
      sendMessageOnEnter={sendMessageOnEnter}
      settings={settings}
      sidebarWidth={sidebarWidth}
      workspaceState={workspaceState}
    />
  )
}
