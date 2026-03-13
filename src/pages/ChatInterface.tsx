import { useMemo, useState } from 'react'
import { ChatHeader } from '../components/ChatHeader'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import type { ChatModeOption } from '../components/chat/ChatModeSelectorField'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspaceFloatingControls } from '../components/layout/WorkspaceFloatingControls'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SidebarPanel } from '../components/sidebar/SidebarPanel'
import { useChatRuntimeConfig } from '../hooks/useChatRuntimeConfig'
import type { ChatMessagesController, ChatRuntimeSelection } from '../hooks/useChatMessages'
import { useProvidersState } from '../hooks/useProvidersState'
import { useChatContextUsage } from '../hooks/useChatContextUsage'
import { useGitBranchState } from '../hooks/useGitBranchState'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useWorkspaceKeyboardShortcuts'
import type { AppSettings } from '../types/chat'

interface ChatInterfaceProps {
  chatMessages: ChatMessagesController
  onOpenSettings: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  sendMessageOnEnter: boolean
  settings: AppSettings
  sidebarWidth: number
}

export function ChatInterface({
  chatMessages,
  onOpenSettings,
  onSidebarWidthChange,
  onUpdateSettings,
  sendMessageOnEnter,
  settings,
  sidebarWidth,
}: ChatInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
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

  useWorkspaceKeyboardShortcuts({
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
    onCreateConversation: createConversation,
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
          onRenameTitle={(nextTitle) => {
            if (!activeConversationId) {
              return
            }

            return renameConversationTitle(activeConversationId, nextTitle)
          }}
        />

        <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden">
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
        </div>

        <div className="flex shrink-0 justify-center pb-4">
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
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
