import { useState } from 'react'
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

interface ChatInterfaceProps {
  language: AppLanguage
  onOpenSettings: () => void
  onSidebarWidthChange: (sidebarWidth: number) => void
  sendMessageOnEnter: boolean
  sidebarWidth: number
}

export function ChatInterface({
  language,
  onOpenSettings,
  onSidebarWidthChange,
  sendMessageOnEnter,
  sidebarWidth,
}: ChatInterfaceProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const providersState = useProvidersState()
  const chatRuntimeConfig = useChatRuntimeConfig(providersState.providersState)
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
  } = useChatMessages(language, {
    isCodexAuthenticated: chatRuntimeConfig.isCodexAuthenticated,
    modelId: chatRuntimeConfig.selectedModelId,
    providerId: chatRuntimeConfig.providerId,
    reasoningEffort: chatRuntimeConfig.reasoningEffort,
  })
  const {
    codexModelOptions,
    reasoningEffort,
    selectedModelId,
    setReasoningEffort,
    setSelectedModelId,
    showReasoningEffortSelector,
  } = chatRuntimeConfig
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
                sendMessageOnEnter={sendMessageOnEnter}
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
              sendOnEnter={sendMessageOnEnter}
              disabled={isLoading || isSending}
              modelOptions={codexModelOptions.map((option) => ({
                label: option.label,
                providerLabel: 'CODEX',
                value: option.id,
              }))}
              selectedModelId={selectedModelId}
              onModelChange={setSelectedModelId}
              reasoningEffort={reasoningEffort}
              onReasoningEffortChange={setReasoningEffort}
              showReasoningEffortSelector={showReasoningEffortSelector}
            />
          </div>
        </div>
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
