import { useEffect, useState } from 'react'
import { ChatHeader } from '../components/ChatHeader'
import { MessageList } from '../components/MessageList'
import { ChatInput } from '../components/ChatInput'
import { EmptyState } from '../components/EmptyState'
import { ResizableSidebarPanel } from '../components/sidebar/ResizableSidebarPanel'
import { SidebarPanel } from '../components/sidebar/SidebarPanel'
import { useChatMessages } from '../hooks/useChatMessages'

export function ChatInterface() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const {
    activeConversationTitle,
    cancelEditingMessage,
    editComposerFocusSignal,
    editComposerValue,
    conversations,
    createConversation,
    deleteConversation,
    editingMessageId,
    error,
    isLoading,
    isSending,
    mainComposerValue,
    messages,
    setEditComposerValue,
    setMainComposerValue,
    selectConversation,
    sendEditedMessage,
    sendNewMessage,
    startEditingMessage,
  } = useChatMessages()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'b') {
        event.preventDefault()
        setIsSidebarOpen((currentValue) => !currentValue)
        return
      }

      if (key === 'n') {
        event.preventDefault()
        void createConversation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createConversation])

  return (
    <div
      className="relative flex h-screen overflow-hidden bg-background"
      style={{ paddingTop: 'env(titlebar-area-height, 0px)' }}
    >
      <div
        className="app-drag-region pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center px-3 text-sm font-medium text-foreground/75"
        style={{ height: 'env(titlebar-area-height, 0px)' }}
      >
        <span className="select-none">EchoSphere</span>
      </div>
      <ResizableSidebarPanel
        isSidebarOpen={isSidebarOpen}
        sidebar={
          <SidebarPanel
            conversations={conversations}
            onDeleteConversation={deleteConversation}
            onNewConversation={createConversation}
            onSelectConversation={selectConversation}
            onToggleSidebar={() => setIsSidebarOpen(false)}
          />
        }
      >
        <main
          className={[
            'flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-surface shadow-soft transition-[border-radius] duration-300 ease-out',
            isSidebarOpen ? 'rounded-l-[28px] rounded-r-none' : 'rounded-none',
            'm-0',
          ].join(' ')}
        >
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
                <EmptyState />
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
        </main>
      </ResizableSidebarPanel>
    </div>
  )
}
