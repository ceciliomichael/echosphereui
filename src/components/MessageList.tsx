import { useEffect, useRef } from 'react'
import type { Message } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { ChatInput } from './ChatInput'
import { UserMessage } from './UserMessage'

interface MessageListProps {
  messages: Message[]
  editingMessageId?: string | null
  onEditUserMessage?: (messageId: string) => void
  composerValue: string
  onComposerValueChange: (value: string) => void
  onSendEditedMessage: () => void
  onCancelEditingMessage: () => void
  composerFocusSignal?: number
  isSending?: boolean
}

export function MessageList({
  messages,
  editingMessageId = null,
  onEditUserMessage,
  composerValue,
  onComposerValueChange,
  onSendEditedMessage,
  onCancelEditingMessage,
  composerFocusSignal,
  isSending = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="scroll-stable flex-1 w-full overflow-y-auto">
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
              <AssistantMessage content={msg.content} />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}


