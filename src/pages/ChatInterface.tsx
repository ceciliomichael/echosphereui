import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitBranch, GitCommitHorizontal, GitCompareArrows } from 'lucide-react'
import { ChatHeader } from '../components/ChatHeader'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import { CommitModal } from '../components/commit/CommitModal'
import type { ChatModeOption } from '../components/chat/ChatModeSelectorField'
import { ConversationDiffPanel, type DiffPanelScope } from '../components/chat/ConversationDiffPanel'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspaceFloatingControls } from '../components/layout/WorkspaceFloatingControls'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SidebarPanel } from '../components/sidebar/SidebarPanel'
import { SourceControlPanel } from '../components/sourceControl/SourceControlPanel'
import { Tooltip } from '../components/Tooltip'
import { useChatRuntimeConfig } from '../hooks/useChatRuntimeConfig'
import type { ChatMessagesController, ChatRuntimeSelection } from '../hooks/useChatMessages'
import { useProvidersState } from '../hooks/useProvidersState'
import { useChatContextUsage } from '../hooks/useChatContextUsage'
import { useGitBranchState } from '../hooks/useGitBranchState'
import { useGitCommit } from '../hooks/useGitCommit'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useWorkspaceKeyboardShortcuts'
import { useGitDiffSnapshot } from '../hooks/useGitDiffSnapshot'
import type { AppSettings, GitCommitAction } from '../types/chat'

export type RightPanelTab = 'diff' | 'source-control'

interface ChatInterfaceProps {
  chatMessages: ChatMessagesController
  diffPanelWidth: number
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
  sendMessageOnEnter: boolean
  settings: AppSettings
  sidebarWidth: number
}

export function ChatInterface({
  chatMessages,
  diffPanelWidth,
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
  sendMessageOnEnter,
  settings,
  sidebarWidth,
}: ChatInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false)
  const [pendingFileActionPath, setPendingFileActionPath] = useState<string | null>(null)
  const providersState = useProvidersState()
  const chatRuntimeConfig = useChatRuntimeConfig({
    providersState: providersState.providersState,
    settings,
    updateSettings: onUpdateSettings,
  })
  const {
    activeConversationId,
    activeConversationRootPath,
    activeConversationTitle,
    cancelEditingMessage,
    conversationGroups,
    createFolder,
    editComposerAttachments,
    editComposerFocusSignal,
    editComposerValue,
    createConversation,
    deleteConversation,
    editingMessageId,
    error,
    isEditComposerDirty,
    isLoading,
    isSending,
    isStreamingTextActive,
    isStreamingResponse,
    mainComposerAttachments,
    mainComposerValue,
    messages,
    revertUserMessage,
    renameConversationTitle,
    selectedChatMode,
    selectedFolderName,
    selectedFolderPath,
    setSelectedChatMode,
    setEditComposerValue,
    setEditComposerAttachments,
    setMainComposerValue,
    setMainComposerAttachments,
    selectConversation,
    sendEditedMessage,
    sendNewMessage,
    streamingAssistantMessageId,
    streamingWaitingIndicatorVariant,
    selectFolder,
    startEditingMessage,
    abortStreamingResponse,
  } = chatMessages
  const runtimeSelection: ChatRuntimeSelection = {
    hasConfiguredProvider: chatRuntimeConfig.hasConfiguredProvider,
    modelId: chatRuntimeConfig.selectedRuntimeModelId,
    providerId: chatRuntimeConfig.providerId,
    providerLabel: chatRuntimeConfig.providerLabel,
    reasoningEffort: chatRuntimeConfig.reasoningEffort,
  }
  const contextUsage = useChatContextUsage({
    agentContextRootPath: activeConversationRootPath ?? selectedFolderPath,
    chatMode: selectedChatMode,
    messages,
    providerId: runtimeSelection.providerId,
  })
  const {
    availableReasoningEfforts,
    modelOptions,
    reasoningEffort,
    selectedModelId,
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector,
  } = chatRuntimeConfig
  const activeWorkspacePath = activeConversationRootPath ?? selectedFolderPath
  const gitBranchState = useGitBranchState(activeWorkspacePath)
  const selectorOptions = useMemo(
    () =>
      modelOptions.map((option) => ({
        label: option.label,
        providerLabel: option.providerLabel,
        value: option.id,
      })),
    [modelOptions],
  )
  const chatModeOptions = useMemo(
    () =>
      [
        {
          description: 'Echo can write and edit code',
          label: 'Agent',
          value: 'agent',
        },
      ] satisfies ChatModeOption[],
    [],
  )
  const hasRepository = gitBranchState.branchState.hasRepository
  const isDiffPanelOpen = isRightPanelOpen && rightPanelTab === 'diff'
  const isSourceControlPanelOpen = isRightPanelOpen && rightPanelTab === 'source-control'
  const { refresh: refreshGitDiffSnapshot, snapshot: gitDiffSnapshot } = useGitDiffSnapshot({
    hasRepository,
    workspacePath: activeWorkspacePath,
  })
  const gitCommitState = useGitCommit({
    hasRepository,
    modelId: runtimeSelection.modelId,
    providerId: runtimeSelection.providerId,
    reasoningEffort: runtimeSelection.reasoningEffort,
    workspacePath: activeWorkspacePath,
  })

  const handleOpenCommitModal = useCallback(() => {
    if (!hasRepository) {
      return
    }

    if (isRightPanelOpen && rightPanelTab === 'source-control') {
      onRightPanelOpenChange(false)
    }

    gitCommitState.resetResult()
    void gitCommitState.refreshStatus()
    setIsCommitModalOpen(true)
  }, [gitCommitState, hasRepository, isRightPanelOpen, onRightPanelOpenChange, rightPanelTab])

  const handleCloseCommitModal = useCallback(() => {
    setIsCommitModalOpen(false)
  }, [])

  const handleCommit = useCallback(
    async (input: {
      action: GitCommitAction
      includeUnstaged: boolean
      message: string
      preferredBranchName?: string
    }) => {
      await gitCommitState.commit(input)
      setIsCommitModalOpen(false)
      // Refresh diffs and branch state after commit
      void refreshGitDiffSnapshot({ forceRefresh: true })
      void gitBranchState.refresh()
    },
    [gitBranchState, gitCommitState, refreshGitDiffSnapshot],
  )
  const previousWorkspacePathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!hasRepository && isRightPanelOpen) {
      onRightPanelOpenChange(false)
    }
  }, [hasRepository, isRightPanelOpen, onRightPanelOpenChange])

  useEffect(() => {
    if (!hasRepository) {
      setPendingFileActionPath(null)
    }
  }, [hasRepository])

  useEffect(() => {
    if (!hasRepository) {
      return
    }

    const normalizedWorkspacePath = activeWorkspacePath?.trim() ?? ''
    const workspacePathKey = normalizedWorkspacePath.length > 0 ? normalizedWorkspacePath : null
    const workspaceChanged = previousWorkspacePathRef.current !== workspacePathKey
    previousWorkspacePathRef.current = workspacePathKey

    void refreshGitDiffSnapshot({
      forceRefresh: !workspaceChanged,
      silent: true,
    })
  }, [
    activeWorkspacePath,
    gitBranchState.branchState.currentBranch,
    hasRepository,
    messages.length,
    refreshGitDiffSnapshot,
  ])

  useWorkspaceKeyboardShortcuts({
    onToggleDiffPanel: () => {
      if (!hasRepository) {
        return
      }

      if (isDiffPanelOpen) {
        onRightPanelOpenChange(false)
        return
      }

      onRightPanelTabChange('diff')
      onRightPanelOpenChange(true)
    },
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
    onCreateConversation: createConversation,
  })

  const handleStageDiffFile = useCallback(
    async (filePath: string) => {
      const normalizedWorkspacePath = activeWorkspacePath?.trim() ?? ''
      if (!hasRepository || normalizedWorkspacePath.length === 0) {
        return
      }

      setPendingFileActionPath(filePath)
      try {
        await window.echosphereGit.stageFile({
          filePath,
          workspacePath: normalizedWorkspacePath,
        })
        await refreshGitDiffSnapshot({ forceRefresh: true, silent: true })
      } catch (error) {
        console.error('Failed to stage file from diff panel', error)
      } finally {
        setPendingFileActionPath(null)
      }
    },
    [activeWorkspacePath, hasRepository, refreshGitDiffSnapshot],
  )

  const handleUnstageDiffFile = useCallback(
    async (filePath: string) => {
      const normalizedWorkspacePath = activeWorkspacePath?.trim() ?? ''
      if (!hasRepository || normalizedWorkspacePath.length === 0) {
        return
      }

      setPendingFileActionPath(filePath)
      try {
        await window.echosphereGit.unstageFile({
          filePath,
          workspacePath: normalizedWorkspacePath,
        })
        await refreshGitDiffSnapshot({ forceRefresh: true, silent: true })
      } catch (error) {
        console.error('Failed to unstage file from diff panel', error)
      } finally {
        setPendingFileActionPath(null)
      }
    },
    [activeWorkspacePath, hasRepository, refreshGitDiffSnapshot],
  )

  const handleDiscardDiffFile = useCallback(
    async (filePath: string) => {
      const normalizedWorkspacePath = activeWorkspacePath?.trim() ?? ''
      if (!hasRepository || normalizedWorkspacePath.length === 0) {
        return
      }

      setPendingFileActionPath(filePath)
      try {
        await window.echosphereGit.discardFileChanges({
          filePath,
          workspacePath: normalizedWorkspacePath,
        })
        await refreshGitDiffSnapshot({ forceRefresh: true, silent: true })
      } catch (error) {
        console.error('Failed to discard file changes from diff panel', error)
      } finally {
        setPendingFileActionPath(null)
      }
    },
    [activeWorkspacePath, hasRepository, refreshGitDiffSnapshot],
  )

  const handleOpenRightPanelTab = useCallback(
    (tab: RightPanelTab) => {
      if (!hasRepository) {
        return
      }

      if (isRightPanelOpen && rightPanelTab === tab) {
        onRightPanelOpenChange(false)
        return
      }

      onRightPanelTabChange(tab)
      onRightPanelOpenChange(true)
    },
    [hasRepository, isRightPanelOpen, onRightPanelOpenChange, onRightPanelTabChange, rightPanelTab],
  )

  const handleRefreshGitUi = useCallback(async () => {
    await Promise.all([refreshGitDiffSnapshot({ forceRefresh: true, silent: true }), gitBranchState.refresh()])
  }, [gitBranchState, refreshGitDiffSnapshot])

  const handleQuickCommit = useCallback(
    async (input: { includeUnstaged: boolean; message: string }) => {
      await gitCommitState.commit({
        action: 'commit',
        includeUnstaged: input.includeUnstaged,
        message: input.message,
      })

      await Promise.all([refreshGitDiffSnapshot({ forceRefresh: true }), gitBranchState.refresh(), gitCommitState.refreshStatus()])
    },
    [gitBranchState, gitCommitState, refreshGitDiffSnapshot],
  )

  return (
    <AppWorkspaceShell
      isSidebarOpen={isSidebarOpen}
      onSidebarWidthChange={onSidebarWidthChange}
      floatingControls={
        <WorkspaceFloatingControls
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
          newThreadButton={{
            onClick: () => void createConversation(),
          }}
        />
      }
      sidebar={
        <SidebarPanel
          conversationGroups={conversationGroups}
          onCreateFolder={createFolder}
          onCreateConversation={createConversation}
          onDeleteConversation={deleteConversation}
          onOpenSettings={onOpenSettings}
          onSelectConversation={selectConversation}
          onSelectFolder={selectFolder}
        />
      }
      sidebarWidth={sidebarWidth}
    >
      <WorkspacePanel isSidebarOpen={isSidebarOpen} showRightBorder={false}>
        <ChatHeader
          title={activeConversationTitle}
          isSidebarOpen={isSidebarOpen}
          trailingContent={
            <div className="flex items-center gap-1">
              <Tooltip content={hasRepository ? 'Commit changes' : 'Open a git-backed folder to commit'} side="bottom">
                <button
                  type="button"
                  disabled={!hasRepository}
                  onClick={handleOpenCommitModal}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors',
                    !hasRepository ? 'cursor-not-allowed opacity-60' : 'hover:text-foreground',
                  ].join(' ')}
                >
                  <GitCommitHorizontal size={16} className="shrink-0" />
                  <span className="hidden md:inline">Commit</span>
                </button>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip content={hasRepository ? 'Toggle Source Control panel' : 'Open a git-backed folder'} side="bottom">
                <button
                  type="button"
                  disabled={!hasRepository}
                  onClick={() => handleOpenRightPanelTab('source-control')}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    isSourceControlPanelOpen ? 'text-foreground' : 'text-muted-foreground',
                    !hasRepository ? 'cursor-not-allowed opacity-60' : 'hover:text-foreground',
                  ].join(' ')}
                >
                  <GitBranch size={16} className="shrink-0" />
                  <span className="hidden md:inline">Source Control</span>
                </button>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip content={hasRepository ? 'Toggle Diff panel' : 'Open a git-backed folder'} side="bottom">
                <button
                  type="button"
                  disabled={!hasRepository}
                  onClick={() => handleOpenRightPanelTab('diff')}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    isDiffPanelOpen ? 'text-foreground' : 'text-muted-foreground',
                    !hasRepository ? 'cursor-not-allowed opacity-60' : 'hover:text-foreground',
                  ].join(' ')}
                >
                  <GitCompareArrows size={16} className="shrink-0" />
                  {hasRepository ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400">{`+${gitDiffSnapshot.totalAddedLineCount}`}</span>
                      <span className="text-red-600 dark:text-red-400">{`-${gitDiffSnapshot.totalRemovedLineCount}`}</span>
                    </>
                  ) : null}
                </button>
              </Tooltip>
            </div>
          }
          onRenameTitle={(nextTitle) => {
            if (!activeConversationId) {
              return
            }

            return renameConversationTitle(activeConversationId, nextTitle)
          }}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              {error ? (
                <div className="chat-input-shell mx-auto rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
                  {error}
                </div>
              ) : null}

              {isLoading ? (
                <div className="flex flex-1 items-center justify-center px-4 text-sm text-subtle-foreground">
                  Loading conversations...
                </div>
              ) : messages.length === 0 ? (
                <EmptyState folderName={selectedFolderName} />
              ) : (
                <MessageList
                  conversationId={activeConversationId}
                  messages={messages}
                  chatModeOptions={chatModeOptions}
                  editingMessageId={editingMessageId}
                  editComposerDirty={isEditComposerDirty}
                  onChatModeChange={setSelectedChatMode}
                  onEditUserMessage={startEditingMessage}
                  onRevertUserMessage={revertUserMessage}
                  composerAttachments={editComposerAttachments}
                  composerValue={editComposerValue}
                  onComposerAttachmentsChange={setEditComposerAttachments}
                  onComposerValueChange={setEditComposerValue}
                  onSendEditedMessage={() => void sendEditedMessage(runtimeSelection)}
                  onAbortStreamingResponse={abortStreamingResponse}
                  onCancelEditingMessage={cancelEditingMessage}
                  composerFocusSignal={editComposerFocusSignal}
                  isSending={isSending}
                  modelOptions={selectorOptions}
                  onModelChange={setSelectedModelId}
                  onReasoningEffortChange={setReasoningEffort}
                  reasoningEffort={reasoningEffort}
                  reasoningEffortOptions={availableReasoningEfforts}
                  selectedChatMode={selectedChatMode}
                  selectedModelId={selectedModelId}
                  sendMessageOnEnter={sendMessageOnEnter}
                  showReasoningEffortSelector={showReasoningEffortSelector}
                  streamingAssistantMessageId={streamingAssistantMessageId}
                  streamingWaitingIndicatorVariant={streamingWaitingIndicatorVariant}
                  streamingTextActive={isStreamingTextActive}
                  workspaceRootPath={activeConversationRootPath}
                />
              )}
            </div>

            <div className="flex w-full shrink-0 justify-center pb-4">
              <div className="chat-input-shell">
                <ChatInput
                  attachments={mainComposerAttachments}
                  contextUsage={contextUsage}
                  value={mainComposerValue}
                  onAttachmentsChange={setMainComposerAttachments}
                  onValueChange={setMainComposerValue}
                  onSend={() => void sendNewMessage(runtimeSelection)}
                  onAbort={abortStreamingResponse}
                  chatModeOptions={chatModeOptions}
                  isStreaming={isStreamingResponse}
                  sendOnEnter={sendMessageOnEnter}
                  disabled={isLoading || isSending}
                  gitBranchError={gitBranchState.errorMessage}
                  gitBranchLoading={gitBranchState.isLoading}
                  gitBranchState={gitBranchState.branchState}
                  gitBranchSwitching={gitBranchState.isSwitching}
                  onChatModeChange={setSelectedChatMode}
                  onGitBranchCreate={gitBranchState.createBranch}
                  onGitBranchChange={gitBranchState.changeBranch}
                  onGitBranchRefresh={gitBranchState.refresh}
                  modelOptions={selectorOptions}
                  selectedChatMode={selectedChatMode}
                  selectedModelId={selectedModelId}
                  onModelChange={setSelectedModelId}
                  reasoningEffort={reasoningEffort}
                  reasoningEffortOptions={availableReasoningEfforts}
                  onReasoningEffortChange={setReasoningEffort}
                  showRuntimeTargetSelector
                  showReasoningEffortSelector={showReasoningEffortSelector}
                />
              </div>
            </div>
          </div>

          <ConversationDiffPanel
            currentBranch={gitBranchState.branchState.currentBranch}
            expandedFilePaths={diffPanelExpandedFilePaths}
            fileDiffs={gitDiffSnapshot.fileDiffs}
            isOpen={isDiffPanelOpen}
            onDiscardFile={handleDiscardDiffFile}
            onExpandedFilePathsChange={onDiffPanelExpandedFilePathsChange}
            onStageFile={handleStageDiffFile}
            onSelectedScopeChange={onDiffPanelSelectedScopeChange}
            onUnstageFile={handleUnstageDiffFile}
            pendingFileActionPath={pendingFileActionPath}
            width={diffPanelWidth}
            onWidthChange={onDiffPanelWidthChange}
            onWidthCommit={onDiffPanelWidthCommit}
            selectedScope={diffPanelSelectedScope}
          />

          <SourceControlPanel
            fileDiffs={gitDiffSnapshot.fileDiffs}
            isOpen={isSourceControlPanelOpen}
            onDiscardFile={handleDiscardDiffFile}
            onOpenCommitModal={handleOpenCommitModal}
            onQuickCommit={handleQuickCommit}
            onRefreshAll={handleRefreshGitUi}
            onSectionOpenChange={(sourceControlSectionOpen) => {
              void onUpdateSettings({ sourceControlSectionOpen })
            }}
            onStageFile={handleStageDiffFile}
            onUnstageFile={handleUnstageDiffFile}
            pendingFileActionPath={pendingFileActionPath}
            onWidthCommit={onDiffPanelWidthCommit}
            onWidthChange={onDiffPanelWidthChange}
            sectionOpen={settings.sourceControlSectionOpen}
            workspacePath={activeWorkspacePath}
            width={diffPanelWidth}
          />
        </div>
      </WorkspacePanel>

      {isCommitModalOpen ? (
        <CommitModal
          branchState={gitBranchState.branchState}
          diffSnapshot={gitDiffSnapshot}
          errorMessage={gitCommitState.errorMessage}
          isCommitting={gitCommitState.isCommitting}
          isLoadingStatus={gitCommitState.isLoadingStatus}
          isSwitchingBranch={gitBranchState.isSwitching}
          onBranchChange={gitBranchState.changeBranch}
          onBranchCreate={gitBranchState.createBranch}
          onClose={handleCloseCommitModal}
          onCommit={handleCommit}
          status={gitCommitState.status}
        />
      ) : null}
    </AppWorkspaceShell>
  )
}
