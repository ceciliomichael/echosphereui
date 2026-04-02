import { useCallback, useMemo, useRef } from 'react'
import { FolderTree, GitBranch, GitCommitHorizontal, GitCompareArrows, Terminal } from 'lucide-react'
import { ChatHeader } from '../../components/ChatHeader'
import { MessageList } from '../../components/MessageList'
import { ChatInput } from '../../components/ChatInput'
import { EmptyState } from '../../components/EmptyState'
import { CommitModal } from '../../components/commit/CommitModal'
import { CommitSuccessDialog } from '../../components/commit/CommitSuccessDialog'
import type { ChatModeOption } from '../../components/chat/ChatModeSelectorField'
import { ConversationDiffPanel, type DiffPanelScope } from '../../components/chat/ConversationDiffPanel'
import { ChatQueueBlock } from '../../components/chat/ChatQueueBlock'
import type { ToolDecisionSubmission } from '../../components/chat/ToolDecisionRequestCard'
import { AppWorkspaceShell } from '../../components/layout/AppWorkspaceShell'
import { WorkspaceFloatingControls } from '../../components/layout/WorkspaceFloatingControls'
import { WorkspacePanel } from '../../components/layout/WorkspacePanel'
import { SidebarPanel } from '../../components/sidebar/SidebarPanel'
import { SourceControlPanel } from '../../components/sourceControl/SourceControlPanel'
import { WorkspaceTerminalPanel } from '../../components/chat/WorkspaceTerminalPanel'
import { Tooltip } from '../../components/Tooltip'
import { WorkspaceExplorerPanel } from '../../components/workspaceExplorer/WorkspaceExplorerPanel'
import { WorkspaceFileTabsPanel } from '../../components/workspaceExplorer/WorkspaceFileTabsPanel'
import { useChatContextUsage } from '../../hooks/useChatContextUsage'
import type { ChatMessagesController, ChatRuntimeSelection } from '../../hooks/useChatMessages'
import type { ChatRuntimeConfigState } from '../../hooks/useChatRuntimeConfig'
import type { ChatInterfaceControllerState } from '../../hooks/useChatInterfaceController'
import type { GitBranchStateController } from '../../hooks/useGitBranchState'
import type { GitCommitController } from '../../hooks/useGitCommit'
import type { GitDiffSnapshotController } from '../../hooks/useGitDiffSnapshot'
import { useWorkspaceRefactorCandidates } from '../../hooks/useWorkspaceRefactorCandidates'
import { useChatMessageQueue } from './useChatMessageQueue'
import type { ChatWorkspaceUiState } from './useChatWorkspaceUiState'
import type { AppSettings, ChatAttachment, ToolInvocationTrace } from '../../types/chat'
import type { ResolvedTheme } from '../../lib/theme'

const CHAT_MODE_OPTIONS: readonly ChatModeOption[] = [
  {
    description: 'Echo can inspect and edit code',
    label: 'Agent',
    value: 'agent',
  },
  {
    description: 'Echo explores and plans with list/read/glob/grep + ask_question + ready_implement',
    label: 'Plan',
    value: 'plan',
  },
] as const

interface ChatInterfaceContentProps {
  chatMessages: ChatMessagesController
  chatRuntimeConfig: ChatRuntimeConfigState
  diffPanelExpandedFilePaths: readonly string[]
  diffPanelSelectedScope: DiffPanelScope
  gitBranchState: GitBranchStateController
  gitCommitState: GitCommitController
  gitDiffSnapshot: GitDiffSnapshotController
  interfaceController: ChatInterfaceControllerState
  onDiffPanelExpandedFilePathsChange: (nextFilePaths: string[]) => void
  onDiffPanelSelectedScopeChange: (nextScope: DiffPanelScope) => void
  onOpenSettings: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  resolvedTheme: ResolvedTheme
  sendMessageOnEnter: boolean
  settings: AppSettings
  sidebarWidth: number
  workspaceState: ChatWorkspaceUiState
}

function buildRuntimeSelection(
  chatRuntimeConfig: ChatRuntimeConfigState,
  terminalExecutionMode: AppSettings['terminalExecutionMode'],
): ChatRuntimeSelection {
  return {
    hasConfiguredProvider: chatRuntimeConfig.hasConfiguredProvider,
    modelId: chatRuntimeConfig.selectedRuntimeModelId,
    providerId: chatRuntimeConfig.providerId,
    providerLabel: chatRuntimeConfig.providerLabel,
    reasoningEffort: chatRuntimeConfig.reasoningEffort,
    terminalExecutionMode,
  }
}

export function ChatInterfaceContent({
  chatMessages,
  chatRuntimeConfig,
  diffPanelExpandedFilePaths,
  diffPanelSelectedScope,
  gitBranchState,
  gitCommitState,
  gitDiffSnapshot,
  interfaceController,
  onDiffPanelExpandedFilePathsChange,
  onDiffPanelSelectedScopeChange,
  onOpenSettings,
  onSidebarWidthChange,
  resolvedTheme,
  sendMessageOnEnter,
  settings,
  sidebarWidth,
  workspaceState,
}: ChatInterfaceContentProps) {
  const activeWorkspacePath = chatMessages.activeConversationRootPath ?? chatMessages.selectedFolderPath
  const runtimeSelection = useMemo(
    () => buildRuntimeSelection(chatRuntimeConfig, settings.terminalExecutionMode),
    [chatRuntimeConfig, settings.terminalExecutionMode],
  )
  const contextUsage = useChatContextUsage({
    agentContextRootPath: activeWorkspacePath,
    chatMode: chatMessages.selectedChatMode,
    messages: chatMessages.messages,
    providerId: runtimeSelection.providerId,
  })
  const { candidates: refactorCandidates, isLoading: refactorCandidatesLoading } =
    useWorkspaceRefactorCandidates(activeWorkspacePath)
  const sendQueuedMessage = useCallback(
    (queuedMessage: { content: string; attachments?: ChatAttachment[] }) => {
      return chatMessages.sendNewMessage(runtimeSelection, queuedMessage.content, queuedMessage.attachments)
    },
    [chatMessages, runtimeSelection],
  )

  const {
    clearQueuedMessages,
    enqueueMessage,
    forceSendQueuedMessage,
    queuedMessages,
    removeQueuedMessage,
    updateQueuedMessage,
  } = useChatMessageQueue({
    isBusy: chatMessages.isLoading || chatMessages.isSending,
    onSendMessage: sendQueuedMessage,
  })
  const selectorOptions = useMemo(
    () =>
      chatRuntimeConfig.modelOptions.map((option) => ({
        label: option.label,
        providerLabel: option.providerLabel,
        value: option.id,
      })),
    [chatRuntimeConfig.modelOptions],
  )
  const chatModeOptions = CHAT_MODE_OPTIONS
  const hasRepository = gitBranchState.branchState.hasRepository
  const messageListBoundaryRef = useRef<HTMLDivElement>(null)

  const handleCreateConversation = useCallback(async (folderId?: string | null) => {
    clearQueuedMessages()
    await chatMessages.createConversation(folderId)
  }, [chatMessages, clearQueuedMessages])

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      clearQueuedMessages()
      void chatMessages.selectConversation(conversationId)
    },
    [chatMessages, clearQueuedMessages],
  )

  const handleSelectFolder = useCallback(async (folderId: string | null) => {
    clearQueuedMessages()
    await chatMessages.selectFolder(folderId)
  }, [chatMessages, clearQueuedMessages])

  const handleCreateFolder = useCallback(async () => {
    clearQueuedMessages()
    await chatMessages.createFolder()
  }, [chatMessages, clearQueuedMessages])

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      clearQueuedMessages()
      void chatMessages.deleteConversation(conversationId)
    },
    [chatMessages, clearQueuedMessages],
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      clearQueuedMessages()
      await chatMessages.deleteFolder(folderId)
    },
    [chatMessages, clearQueuedMessages],
  )

  const handleRevertUserMessage = useCallback(
    (messageId: string) => {
      clearQueuedMessages()
      void chatMessages.revertUserMessage(messageId)
    },
    [chatMessages, clearQueuedMessages],
  )

  const handleSendMainMessage = useCallback(
    (value: string, attachments: ChatAttachment[]) => {
      if (chatMessages.isLoading || chatMessages.isSending) {
        enqueueMessage(value, attachments)
        return
      }

      void chatMessages.sendNewMessage(runtimeSelection, value, attachments)
    },
    [chatMessages, enqueueMessage, runtimeSelection],
  )

  const handleSendEditedMessage = useCallback(
    (value: string, attachments: ChatAttachment[]) => {
      void chatMessages.sendEditedMessage(runtimeSelection, value, attachments)
    },
    [chatMessages, runtimeSelection],
  )

  const showQueueBlock =
    queuedMessages.length > 0 &&
    typeof removeQueuedMessage === 'function' &&
    typeof updateQueuedMessage === 'function' &&
    typeof forceSendQueuedMessage === 'function'

  const handleToolDecisionSubmit = useCallback(
    (invocation: ToolInvocationTrace, submission: ToolDecisionSubmission) => {
      const decisionRequest = invocation.decisionRequest
      if (!decisionRequest) {
        return
      }

      if (invocation.toolName === 'ready_implement') {
        const nextMode =
          submission.selectedOptionId === 'yes_implement'
            ? 'agent'
            : submission.selectedOptionId === 'no_modify'
              ? 'plan'
              : chatMessages.selectedChatMode
        chatMessages.setSelectedChatMode(nextMode)
      }

      void window.echosphereChat
        .submitToolDecision({
          customAnswer: submission.customAnswer,
          invocationId: invocation.id,
          selectedOptionId: submission.selectedOptionId,
          streamId: decisionRequest.streamId,
        })
        .catch((error) => {
          console.error(error)
        })
    },
    [chatMessages],
  )

  return (
    <AppWorkspaceShell
      isSidebarOpen={interfaceController.isSidebarOpen}
      onSidebarWidthChange={onSidebarWidthChange}
      floatingControls={
        <WorkspaceFloatingControls
          isSidebarOpen={interfaceController.isSidebarOpen}
          onToggleSidebar={interfaceController.handleToggleSidebar}
          newThreadButton={{
            onClick: handleCreateConversation,
          }}
        />
      }
      sidebar={
        <SidebarPanel
          conversationGroups={chatMessages.conversationGroups}
          onCreateFolder={handleCreateFolder}
          onCreateConversation={handleCreateConversation}
          onDeleteConversation={handleDeleteConversation}
          onDeleteFolder={handleDeleteFolder}
          onOpenSettings={onOpenSettings}
          onRenameFolder={chatMessages.renameFolder}
          onSelectConversation={handleSelectConversation}
          onSelectFolder={handleSelectFolder}
        />
      }
      sidebarWidth={sidebarWidth}
    >
      <WorkspacePanel isSidebarOpen={interfaceController.isSidebarOpen} showRightBorder={false}>
        <ChatHeader
          title={chatMessages.activeConversationTitle}
          isSidebarOpen={interfaceController.isSidebarOpen}
          trailingContent={
            <div className="flex items-center gap-1">
              <Tooltip content={workspaceState.isTerminalOpen ? 'Hide terminal panel' : 'Open terminal panel'} side="bottom">
                <button
                  type="button"
                  onClick={() => interfaceController.setActiveWorkspaceTerminalOpen(!workspaceState.isTerminalOpen)}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    workspaceState.isTerminalOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  <Terminal size={16} className="shrink-0" />
                  <span className="hidden md:inline">Terminal</span>
                </button>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip content={hasRepository ? 'Commit changes' : 'Open a git-backed folder to commit'} side="bottom">
                <button
                  type="button"
                  disabled={!hasRepository}
                  onClick={interfaceController.handleOpenCommitModal}
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
                  onClick={workspaceState.handleOpenSourceControlPanel}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    interfaceController.isSourceControlPanelOpen ? 'text-foreground' : 'text-muted-foreground',
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
                  onClick={workspaceState.handleOpenDiffPanel}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    interfaceController.isDiffPanelOpen ? 'text-foreground' : 'text-muted-foreground',
                    !hasRepository ? 'cursor-not-allowed opacity-60' : 'hover:text-foreground',
                  ].join(' ')}
                >
                  <GitCompareArrows size={16} className="shrink-0" />
                  {hasRepository ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400">{`+${gitDiffSnapshot.snapshot.totalAddedLineCount}`}</span>
                      <span className="text-red-600 dark:text-red-400">{`-${gitDiffSnapshot.snapshot.totalRemovedLineCount}`}</span>
                    </>
                  ) : null}
                </button>
              </Tooltip>
              <div className="mx-1 h-5 w-px bg-border" />
              <Tooltip content={workspaceState.isExplorerOpen ? 'Close explorer panel' : 'Open explorer panel'} side="bottom">
                <button
                  type="button"
                  onClick={workspaceState.handleToggleExplorerPanel}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    workspaceState.isExplorerOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  <FolderTree size={16} className="shrink-0" />
                  <span className="hidden md:inline">Explorer</span>
                </button>
              </Tooltip>
            </div>
          }
          onRenameTitle={(nextTitle) => {
            if (!chatMessages.activeConversationId) {
              return
            }

            return chatMessages.renameConversationTitle(chatMessages.activeConversationId, nextTitle)
          }}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              {chatMessages.error ? (
                <div className="chat-input-shell mx-auto rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
                  {chatMessages.error}
                </div>
              ) : null}

              {chatMessages.isLoading ? (
                <div className="flex flex-1 items-center justify-center px-4 text-sm text-subtle-foreground">
                  Loading conversations...
                </div>
              ) : chatMessages.messages.length === 0 ? (
                <EmptyState folderName={chatMessages.selectedFolderName} />
              ) : (
                <div ref={messageListBoundaryRef} className="flex min-h-0 flex-1 flex-col">
                  <MessageList
                    conversationId={chatMessages.activeConversationId}
                    messages={chatMessages.messages}
                    chatModeOptions={chatModeOptions}
                    editingMessageId={chatMessages.editingMessageId}
                    editComposerDirty={chatMessages.isEditComposerDirty}
                    editComposerMentionPathMap={chatMessages.editComposerMentionPathMap}
                    onChatModeChange={chatMessages.setSelectedChatMode}
                    onToolDecisionSubmit={handleToolDecisionSubmit}
                    onEditUserMessage={chatMessages.startEditingMessage}
                    onRevertUserMessage={handleRevertUserMessage}
                    composerAttachments={chatMessages.editComposerAttachments}
                    composerValue={chatMessages.editComposerValue}
                    onComposerAttachmentsChange={chatMessages.setEditComposerAttachments}
                    onComposerValueChange={chatMessages.setEditComposerValue}
                    onSendEditedMessage={handleSendEditedMessage}
                    onAbortStreamingResponse={chatMessages.abortStreamingResponse}
                    onCancelEditingMessage={chatMessages.cancelEditingMessage}
                    composerFocusSignal={chatMessages.editComposerFocusSignal}
                    isSending={chatMessages.isSending}
                    modelOptions={selectorOptions}
                    modelOptionsLoading={chatRuntimeConfig.isModelOptionsLoading}
                    onModelChange={chatRuntimeConfig.setSelectedModelId}
                    onReasoningEffortChange={chatRuntimeConfig.setReasoningEffort}
                    reasoningEffort={chatRuntimeConfig.reasoningEffort}
                    reasoningEffortOptions={chatRuntimeConfig.availableReasoningEfforts}
                    selectedChatMode={chatMessages.selectedChatMode}
                    selectedModelId={chatRuntimeConfig.selectedModelId}
                    sendMessageOnEnter={sendMessageOnEnter}
                    showReasoningEffortSelector={chatRuntimeConfig.showReasoningEffortSelector}
                    streamingAssistantMessageId={chatMessages.streamingAssistantMessageId}
                    streamingWaitingIndicatorVariant={chatMessages.streamingWaitingIndicatorVariant}
                    streamingTextActive={chatMessages.isStreamingTextActive}
                    workspaceRootPath={activeWorkspacePath}
                  />
                </div>
              )}
            </div>

            <div className="flex w-full shrink-0 flex-col items-center pb-4">
              {showQueueBlock ? (
                <div className="chat-queue-shell">
                  <ChatQueueBlock
                    queuedMessages={queuedMessages}
                    editCancelBoundaryRef={messageListBoundaryRef}
                    onClearQueue={clearQueuedMessages}
                    onForceSend={forceSendQueuedMessage}
                    onRemove={removeQueuedMessage}
                    onUpdate={updateQueuedMessage}
                  />
                </div>
              ) : null}

              <div className="chat-input-shell">
                <ChatInput
                  attachments={chatMessages.mainComposerAttachments}
                  contextUsage={contextUsage}
                  refactorCandidates={refactorCandidates}
                  refactorCandidatesLoading={refactorCandidatesLoading}
                  value={chatMessages.mainComposerValue}
                  onAttachmentsChange={chatMessages.setMainComposerAttachments}
                  onValueChange={chatMessages.setMainComposerValue}
                  onSend={handleSendMainMessage}
                  onQueue={(value, attachments) => enqueueMessage(value, attachments)}
                  onAbort={chatMessages.abortStreamingResponse}
                  chatModeOptions={chatModeOptions}
                  isStreaming={chatMessages.isStreamingResponse || chatMessages.isSending}
                  sendOnEnter={sendMessageOnEnter}
                  disabled={chatMessages.isLoading}
                  gitBranchError={gitBranchState.errorMessage}
                  gitBranchLoading={gitBranchState.isLoading}
                  gitBranchState={gitBranchState.branchState}
                  gitBranchSwitching={gitBranchState.isSwitching}
                  onChatModeChange={chatMessages.setSelectedChatMode}
                  onGitBranchCreate={gitBranchState.createBranch}
                  onGitBranchChange={gitBranchState.changeBranch}
                  onGitBranchRefresh={gitBranchState.refresh}
                  modelOptions={selectorOptions}
                  modelOptionsLoading={chatRuntimeConfig.isModelOptionsLoading}
                  selectedChatMode={chatMessages.selectedChatMode}
                  selectedModelId={chatRuntimeConfig.selectedModelId}
                  onModelChange={chatRuntimeConfig.setSelectedModelId}
                  onRefactorCandidateSelect={workspaceState.handleOpenWorkspaceFile}
                  reasoningEffort={chatRuntimeConfig.reasoningEffort}
                  reasoningEffortOptions={chatRuntimeConfig.availableReasoningEfforts}
                  onReasoningEffortChange={chatRuntimeConfig.setReasoningEffort}
                  showRuntimeTargetSelector
                  showTerminalExecutionModeSelector
                  showReasoningEffortSelector={chatRuntimeConfig.showReasoningEffortSelector}
                  terminalExecutionMode={settings.terminalExecutionMode}
                  onTerminalExecutionModeChange={interfaceController.handleTerminalExecutionModeChange}
                  workspaceRootPath={activeWorkspacePath}
                />
              </div>
            </div>
          </div>
          {workspaceState.isWorkspaceTabsPanelOpen ? (
            <WorkspaceFileTabsPanel
              activeTabPath={workspaceState.activeWorkspaceFilePath}
              isOpen={workspaceState.isWorkspaceTabsPanelOpen}
              onCloseTab={workspaceState.handleCloseWorkspaceTab}
              onFileContentChange={workspaceState.handleWorkspaceFileContentChange}
              onSelectTab={workspaceState.handleSelectWorkspaceTab}
              onWidthChange={workspaceState.handleWorkspaceEditorWidthChange}
              onWidthCommit={workspaceState.handleWorkspaceEditorWidthCommit}
              wordWrapEnabled={settings.workspaceFileEditorWordWrap}
              tabs={workspaceState.workspaceFileTabs}
              width={workspaceState.workspaceEditorWidth}
            />
          ) : null}
          {workspaceState.isExplorerOpen ? (
            <WorkspaceExplorerPanel
              activeFilePath={workspaceState.activeWorkspaceFilePath}
              clipboardEntry={workspaceState.workspaceClipboard}
              isOpen={workspaceState.isExplorerOpen}
              onCopyEntry={workspaceState.handleCopyWorkspaceEntry}
              onCreateEntry={workspaceState.handleCreateWorkspaceEntry}
              onCutEntry={workspaceState.handleCutWorkspaceEntry}
              onDeleteEntry={workspaceState.handleDeleteWorkspaceEntry}
              onImportEntry={workspaceState.handleImportWorkspaceEntry}
              onMoveEntry={workspaceState.handleMoveWorkspaceEntry}
              onOpenFile={workspaceState.handleOpenWorkspaceFile}
              onPasteEntry={workspaceState.handlePasteWorkspaceEntry}
              onRenameEntry={workspaceState.handleRenameWorkspaceEntry}
              onWidthChange={workspaceState.handleWorkspaceExplorerWidthChange}
              onWidthCommit={workspaceState.handleWorkspaceExplorerWidthCommit}
              width={workspaceState.workspaceExplorerWidth}
              workspaceRootPath={workspaceState.activeWorkspacePath}
            />
          ) : null}

          {interfaceController.isDiffPanelOpen ? (
            <ConversationDiffPanel
              currentBranch={gitBranchState.branchState.currentBranch}
              expandedFilePaths={diffPanelExpandedFilePaths}
              fileDiffs={gitDiffSnapshot.snapshot.fileDiffs}
              isOpen={interfaceController.isDiffPanelOpen}
              onDiscardFile={interfaceController.handleDiscardDiffFile}
              onExpandedFilePathsChange={onDiffPanelExpandedFilePathsChange}
              onStageFile={interfaceController.handleStageDiffFile}
              onSelectedScopeChange={onDiffPanelSelectedScopeChange}
              onUnstageFile={interfaceController.handleUnstageDiffFile}
              pendingFileActionPath={interfaceController.pendingFileActionPath}
              width={workspaceState.conversationDiffPanelWidth}
              onWidthChange={workspaceState.handleConversationDiffPanelWidthChange}
              onWidthCommit={workspaceState.handleConversationDiffPanelWidthCommit}
              selectedScope={diffPanelSelectedScope}
            />
          ) : null}

          {interfaceController.isSourceControlPanelOpen ? (
            <SourceControlPanel
              fileDiffs={gitDiffSnapshot.snapshot.fileDiffs}
              isOpen={interfaceController.isSourceControlPanelOpen}
              onDiscardFile={interfaceController.handleDiscardDiffFile}
              onOpenCommitModal={interfaceController.handleOpenCommitModal}
              onQuickCommit={interfaceController.handleQuickCommit}
              onRefreshAll={interfaceController.handleRefreshGitUi}
              onSectionOpenChange={interfaceController.handleSourceControlSectionOpenChange}
              onStageFile={interfaceController.handleStageDiffFile}
              onUnstageFile={interfaceController.handleUnstageDiffFile}
              pendingFileActionPath={interfaceController.pendingFileActionPath}
              onWidthCommit={workspaceState.handleSourceControlPanelWidthCommit}
              onWidthChange={workspaceState.handleSourceControlPanelWidthChange}
              sectionOpen={settings.sourceControlSectionOpen}
              workspacePath={workspaceState.activeWorkspacePath}
              width={workspaceState.sourceControlPanelWidth}
            />
          ) : null}
        </div>
        <WorkspaceTerminalPanel
          isOpen={workspaceState.isTerminalOpen}
          onClose={() => interfaceController.setActiveWorkspaceTerminalOpen(false)}
          onHeightCommit={interfaceController.handleTerminalPanelHeightCommit}
          resolvedTheme={resolvedTheme}
          storedHeight={workspaceState.terminalPanelHeight}
          workspaceKey={workspaceState.activeWorkspacePath ?? '__global__'}
          workspacePath={workspaceState.activeWorkspacePath}
        />
      </WorkspacePanel>

      {interfaceController.isCommitModalOpen ? (
        <CommitModal
          branchState={gitBranchState.branchState}
          diffSnapshot={gitDiffSnapshot.snapshot}
          errorMessage={gitCommitState.errorMessage}
          isCommitting={gitCommitState.isCommitting}
          isLoadingStatus={gitCommitState.isLoadingStatus}
          isSwitchingBranch={gitBranchState.isSwitching}
          onBranchChange={gitBranchState.changeBranch}
          onBranchCreate={gitBranchState.createBranch}
          onClose={interfaceController.handleCloseCommitModal}
          onCommit={interfaceController.handleCommit}
          status={gitCommitState.status}
        />
      ) : null}
      {interfaceController.commitSuccessDialog ? (
        <CommitSuccessDialog
          action={interfaceController.commitSuccessDialog.action}
          result={interfaceController.commitSuccessDialog.result}
          onClose={interfaceController.handleCloseCommitSuccessDialog}
        />
      ) : null}
    </AppWorkspaceShell>
  )
}
