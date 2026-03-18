import { useCallback, useMemo } from 'react'
import { GitBranch, GitCommitHorizontal, GitCompareArrows, Terminal } from 'lucide-react'
import { ChatHeader } from '../components/ChatHeader'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import { CommitModal } from '../components/commit/CommitModal'
import { CommitSuccessDialog } from '../components/commit/CommitSuccessDialog'
import type { ChatModeOption } from '../components/chat/ChatModeSelectorField'
import { ConversationDiffPanel, type DiffPanelScope } from '../components/chat/ConversationDiffPanel'
import type { ToolDecisionSubmission } from '../components/chat/ToolDecisionRequestCard'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspaceFloatingControls } from '../components/layout/WorkspaceFloatingControls'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SidebarPanel } from '../components/sidebar/SidebarPanel'
import { SourceControlPanel } from '../components/sourceControl/SourceControlPanel'
import { WorkspaceTerminalPanel } from '../components/chat/WorkspaceTerminalPanel'
import { Tooltip } from '../components/Tooltip'
import { useChatRuntimeConfig } from '../hooks/useChatRuntimeConfig'
import type { ChatMessagesController, ChatRuntimeSelection } from '../hooks/useChatMessages'
import { useProvidersState } from '../hooks/useProvidersState'
import { useChatContextUsage } from '../hooks/useChatContextUsage'
import { useGitBranchState } from '../hooks/useGitBranchState'
import { useGitCommit } from '../hooks/useGitCommit'
import { useGitDiffSnapshot } from '../hooks/useGitDiffSnapshot'
import {
  useChatInterfaceController,
  type ChatInterfaceRightPanelTab,
} from '../hooks/useChatInterfaceController'
import { DEFAULT_TERMINAL_PANEL_HEIGHT } from '../lib/terminalPanelSizing'
import type { ResolvedTheme } from '../lib/theme'
import type { AppSettings, ToolInvocationTrace } from '../types/chat'

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
  resolvedTheme: ResolvedTheme
  sendMessageOnEnter: boolean
  settings: AppSettings
  sidebarWidth: number
}

const DEFAULT_TERMINAL_WORKSPACE_KEY = '__global__'

function toTerminalWorkspaceKey(workspacePath: string | null) {
  const normalizedPath = workspacePath?.trim() ?? ''
  if (normalizedPath.length === 0) {
    return DEFAULT_TERMINAL_WORKSPACE_KEY
  }

  return normalizedPath
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
  resolvedTheme,
  sendMessageOnEnter,
  settings,
  sidebarWidth,
}: ChatInterfaceProps) {
  const providersState = useProvidersState()
  const chatRuntimeConfig = useChatRuntimeConfig({
    isActiveScreen,
    isProvidersLoading: providersState.isLoading,
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
    deleteFolder,
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
    renameFolder,
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
  const runtimeSelection: ChatRuntimeSelection = useMemo(
    () => ({
      hasConfiguredProvider: chatRuntimeConfig.hasConfiguredProvider,
      modelId: chatRuntimeConfig.selectedRuntimeModelId,
      providerId: chatRuntimeConfig.providerId,
      providerLabel: chatRuntimeConfig.providerLabel,
      reasoningEffort: chatRuntimeConfig.reasoningEffort,
      terminalExecutionMode: settings.terminalExecutionMode,
    }),
    [
      chatRuntimeConfig.hasConfiguredProvider,
      chatRuntimeConfig.providerId,
      chatRuntimeConfig.providerLabel,
      chatRuntimeConfig.reasoningEffort,
      chatRuntimeConfig.selectedRuntimeModelId,
      settings.terminalExecutionMode,
    ],
  )
  const contextUsage = useChatContextUsage({
    agentContextRootPath: activeConversationRootPath ?? selectedFolderPath,
    chatMode: selectedChatMode,
    messages,
    providerId: runtimeSelection.providerId,
  })
  const {
    availableReasoningEfforts,
    modelOptions,
    isModelOptionsLoading,
    reasoningEffort,
    selectedModelId,
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector,
  } = chatRuntimeConfig
  const activeWorkspacePath = activeConversationRootPath ?? selectedFolderPath
  const activeTerminalWorkspaceKey = toTerminalWorkspaceKey(activeWorkspacePath)
  const isTerminalOpen = settings.terminalOpenByWorkspace[activeTerminalWorkspaceKey] ?? false
  const terminalPanelHeight = settings.terminalPanelHeightsByWorkspace[activeTerminalWorkspaceKey] ?? DEFAULT_TERMINAL_PANEL_HEIGHT
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
          description: 'Echo can inspect and edit code',
          label: 'Agent',
          value: 'agent',
        },
        {
          description: 'Echo explores and plans with list/read/glob/grep + ask_question + update_plan + ready_implement',
          label: 'Plan',
          value: 'plan',
        },
      ] satisfies ChatModeOption[],
    [],
  )
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
              : selectedChatMode
        setSelectedChatMode(nextMode)
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
    [selectedChatMode, setSelectedChatMode],
  )
  const hasRepository = gitBranchState.branchState.hasRepository
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
  const {
    commitSuccessDialog,
    handleCloseCommitModal,
    handleCloseCommitSuccessDialog,
    handleCommit,
    handleDiscardDiffFile,
    handleOpenCommitModal,
    handleOpenRightPanelTab,
    handleQuickCommit,
    handleRefreshGitUi,
    handleSourceControlSectionOpenChange,
    handleStageDiffFile,
    handleTerminalExecutionModeChange,
    handleTerminalPanelHeightCommit,
    handleUnstageDiffFile,
    isCommitModalOpen,
    isDiffPanelOpen,
    isSidebarOpen,
    isSourceControlPanelOpen,
    pendingFileActionPath,
    setActiveWorkspaceTerminalOpen,
    setIsSidebarOpen,
  } = useChatInterfaceController({
    activeTerminalWorkspaceKey,
    activeWorkspacePath,
    createConversation,
    gitBranchState,
    gitCommitState,
    hasRepository,
    isActiveScreen,
    isRightPanelOpen,
    messagesLength: messages.length,
    onDiffRefresh: refreshGitDiffSnapshot,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    onUpdateSettings,
    rightPanelTab,
    settings,
  })

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
          onDeleteFolder={deleteFolder}
          onOpenSettings={onOpenSettings}
          onRenameFolder={renameFolder}
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
              <Tooltip content={isTerminalOpen ? 'Hide terminal panel' : 'Open terminal panel'} side="bottom">
                <button
                  type="button"
                  onClick={() => setActiveWorkspaceTerminalOpen(!isTerminalOpen)}
                  className={[
                    'inline-flex h-10 items-center gap-1.5 text-sm transition-colors',
                    isTerminalOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
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
                  onToolDecisionSubmit={handleToolDecisionSubmit}
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
                  modelOptionsLoading={isModelOptionsLoading}
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
                  modelOptionsLoading={isModelOptionsLoading}
                  selectedChatMode={selectedChatMode}
                  selectedModelId={selectedModelId}
                  onModelChange={setSelectedModelId}
                  reasoningEffort={reasoningEffort}
                  reasoningEffortOptions={availableReasoningEfforts}
                  onReasoningEffortChange={setReasoningEffort}
                  showRuntimeTargetSelector
                  showTerminalExecutionModeSelector
                  showReasoningEffortSelector={showReasoningEffortSelector}
                  terminalExecutionMode={settings.terminalExecutionMode}
                  onTerminalExecutionModeChange={handleTerminalExecutionModeChange}
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
            onSectionOpenChange={handleSourceControlSectionOpenChange}
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
        <WorkspaceTerminalPanel
          isOpen={isTerminalOpen}
          onClose={() => setActiveWorkspaceTerminalOpen(false)}
          onHeightCommit={handleTerminalPanelHeightCommit}
          resolvedTheme={resolvedTheme}
          storedHeight={terminalPanelHeight}
          workspacePath={activeWorkspacePath}
        />
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
      {commitSuccessDialog ? (
        <CommitSuccessDialog
          action={commitSuccessDialog.action}
          result={commitSuccessDialog.result}
          onClose={handleCloseCommitSuccessDialog}
        />
      ) : null}
    </AppWorkspaceShell>
  )
}
