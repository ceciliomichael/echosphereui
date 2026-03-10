import { useRef } from 'react'
import { useAutoScroll } from '../hooks/useAutoScroll'
import type { Message } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { ChatInput } from './ChatInput'
import { UserMessage } from './UserMessage'

interface MessageListProps {
  conversationId: string | null
  composerValue: string
  composerFocusSignal?: number
  editingMessageId?: string | null
  isSending?: boolean
  messages: Message[]
  onCancelEditingMessage: () => void
  onComposerValueChange: (value: string) => void
  onEditUserMessage?: (messageId: string) => void
  onSendEditedMessage: () => void
  sendMessageOnEnter: boolean
  streamingAssistantMessageId?: string | null
}

export function MessageList({
  conversationId,
  messages,
  editingMessageId = null,
  onEditUserMessage,
  composerValue,
  onComposerValueChange,
  onSendEditedMessage,
  onCancelEditingMessage,
  composerFocusSignal,
  isSending = false,
  sendMessageOnEnter,
  streamingAssistantMessageId = null,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useAutoScroll(scrollContainerRef, messages, {
    resetKey: conversationId,
    shouldAutoScroll: true,
  })

  return (
    <div ref={scrollContainerRef} className="scroll-stable flex-1 w-full overflow-y-auto">
      <div className="chat-column mx-auto space-y-4 px-4 pb-6 pt-6">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'flex min-w-0 justify-end' : 'flex min-w-0 justify-start'}>
            {msg.role === 'user' ? (
              editingMessageId === msg.id ? (
                <div className="-mx-4 w-[calc(100%+2rem)]">
                  <ChatInput
                    value={composerValue}
                    onValueChange={onComposerValueChange}
                    onSend={onSendEditedMessage}
                    onCancelEdit={onCancelEditingMessage}
                    isEditing
                    sendOnEnter={sendMessageOnEnter}
                    variant="inline"
                    focusSignal={composerFocusSignal}
                    disabled={isSending}
                  />
                </div>
              ) : (
                <div className="-mx-4 w-[calc(100%+2rem)]">
                  <UserMessage content={msg.content} onEdit={onEditUserMessage ? () => onEditUserMessage(msg.id) : undefined} />
                </div>
              )
            ) : (
              <AssistantMessage
                content={msg.content}
                isStreaming={streamingAssistantMessageId === msg.id}
                reasoningCompletedAt={msg.reasoningCompletedAt}
                reasoningContent={msg.reasoningContent}
                timestamp={msg.timestamp}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}


