import { useMemo, useState } from 'react'
import { ChatHeader } from '../components/ChatHeader'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SidebarPanel } from '../components/sidebar/SidebarPanel'
import { useChatMessages } from '../hooks/useChatMessages'
import { useChatRuntimeConfig } from '../hooks/useChatRuntimeConfig'
import { useProvidersState } from '../hooks/useProvidersState'
import { useWorkspaceKeyboardShortcuts } from '../hooks/useWorkspaceKeyboardShortcuts'
import type { AppLanguage } from '../lib/appSettings'
import type { AppSettings } from '../types/chat'

interface ChatInterfaceProps {
  language: AppLanguage
  onOpenSettings: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  sendMessageOnEnter: boolean
  settings: AppSettings
  sidebarWidth: number
}

export function ChatInterface({
  language,
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
    activeConversationTitle,
    cancelEditingMessage,
    conversationGroups,
    createFolder,
    editComposerFocusSignal,
    editComposerValue,
    createConversation,
    deleteConversation,
    editingMessageId,
    error,
    isLoading,
    isSending,
    isStreamingResponse,
    mainComposerValue,
    messages,
    selectedFolderName,
    setEditComposerValue,
    setMainComposerValue,
    selectConversation,
    sendEditedMessage,
    sendNewMessage,
    streamingAssistantMessageId,
    selectFolder,
    startEditingMessage,
    abortStreamingResponse,
  } = useChatMessages(language, {
    hasConfiguredProvider: chatRuntimeConfig.hasConfiguredProvider,
    modelId: chatRuntimeConfig.selectedRuntimeModelId,
    providerId: chatRuntimeConfig.providerId,
    providerLabel: chatRuntimeConfig.providerLabel,
    reasoningEffort: chatRuntimeConfig.reasoningEffort,
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
  const selectorOptions = useMemo(
    () =>
      modelOptions.map((option) => ({
        label: option.label,
        providerLabel: option.providerLabel,
        value: option.id,
      })),
    [modelOptions],
  )

  useWorkspaceKeyboardShortcuts({
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
    onCreateConversation: createConversation,
  })

  return (
    <AppWorkspaceShell
      isSidebarOpen={isSidebarOpen}
      onSidebarWidthChange={onSidebarWidthChange}
      sidebar={
        <SidebarPanel
          conversationGroups={conversationGroups}
          onCreateFolder={createFolder}
          onCreateConversation={createConversation}
          onDeleteConversation={deleteConversation}
          onOpenSettings={onOpenSettings}
          onSelectConversation={selectConversation}
          onSelectFolder={selectFolder}
          onToggleSidebar={() => setIsSidebarOpen(false)}
        />
      }
      sidebarWidth={sidebarWidth}
    >
      <WorkspacePanel isSidebarOpen={isSidebarOpen} showRightBorder={false}>
        <ChatHeader
          title={activeConversationTitle}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
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
                editingMessageId={editingMessageId}
                onEditUserMessage={startEditingMessage}
                composerValue={editComposerValue}
                onComposerValueChange={setEditComposerValue}
                onSendEditedMessage={sendEditedMessage}
                onCancelEditingMessage={cancelEditingMessage}
                composerFocusSignal={editComposerFocusSignal}
                isSending={isSending}
                modelOptions={selectorOptions}
                onModelChange={setSelectedModelId}
                onReasoningEffortChange={setReasoningEffort}
                reasoningEffort={reasoningEffort}
                reasoningEffortOptions={availableReasoningEfforts}
                selectedModelId={selectedModelId}
                sendMessageOnEnter={sendMessageOnEnter}
                showReasoningEffortSelector={showReasoningEffortSelector}
                streamingAssistantMessageId={streamingAssistantMessageId}
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-center pb-4">
          <div className="chat-input-shell">
            <ChatInput
              value={mainComposerValue}
              onValueChange={setMainComposerValue}
              onSend={sendNewMessage}
              onAbort={abortStreamingResponse}
              isStreaming={isStreamingResponse}
              sendOnEnter={sendMessageOnEnter}
              disabled={isLoading || isSending}
              modelOptions={selectorOptions}
              selectedModelId={selectedModelId}
              onModelChange={setSelectedModelId}
              reasoningEffort={reasoningEffort}
              reasoningEffortOptions={availableReasoningEfforts}
              onReasoningEffortChange={setReasoningEffort}
              showReasoningEffortSelector={showReasoningEffortSelector}
            />
          </div>
        </div>
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
