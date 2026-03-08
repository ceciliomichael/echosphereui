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

interface ChatInterfaceProps {
  onOpenSettings: () => void
}

export function ChatInterface({ onOpenSettings }: ChatInterfaceProps) {
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
  } = useChatMessages()
  useWorkspaceKeyboardShortcuts({
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
    onCreateConversation: createConversation,
  })

  return (
    <AppWorkspaceShell
      isSidebarOpen={isSidebarOpen}
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
    >
      <WorkspacePanel isSidebarOpen={isSidebarOpen}>
        <ChatHeader
          title={activeConversationTitle}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
        />

        <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden">
          <div className="flex min-h-0 w-full flex-1 flex-col">
            {error ? (
              <div className="chat-input-shell mx-auto rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
              disabled={isLoading || isSending}
            />
          </div>
        </div>
      </WorkspacePanel>
    </AppWorkspaceShell>
  )
}
