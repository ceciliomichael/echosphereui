import { useState } from 'react'
import { ChatHeader } from '../components/ChatHeader'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import { AppWorkspaceShell } from '../components/layout/AppWorkspaceShell'
import { WorkspacePanel } from '../components/layout/WorkspacePanel'
import { SidebarPanel } from '../components/sidebar/SidebarPanel'
import { useChatMessages } from '../hooks/useChatMessages'
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
  const {
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
    selectFolder,
    startEditingMessage,
  } = useChatMessages(language)
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
            />
          </div>
        </div>
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
