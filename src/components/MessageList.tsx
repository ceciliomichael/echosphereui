import { memo, useRef } from 'react'
import { useAutoScroll } from '../hooks/useAutoScroll'
import type { Message, ReasoningEffort } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { ChatInput } from './ChatInput'
import { UserMessage } from './UserMessage'
import type { ModelSelectorOption } from './chat/ModelSelectorField'

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
  onModelChange?: (modelId: string) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSendEditedMessage: () => void
  modelOptions?: readonly ModelSelectorOption[]
  reasoningEffort?: ReasoningEffort
  selectedModelId?: string
  sendMessageOnEnter: boolean
  showReasoningEffortSelector?: boolean
  streamingAssistantMessageId?: string | null
}

interface MessageRowProps {
  composerFocusSignal?: number
  composerValue: string
  isEditing: boolean
  isSending: boolean
  isStreaming: boolean
  message: Message
  onCancelEditingMessage: () => void
  onComposerValueChange: (value: string) => void
  onEditUserMessage?: (messageId: string) => void
  onModelChange?: (modelId: string) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSendEditedMessage: () => void
  modelOptions?: readonly ModelSelectorOption[]
  reasoningEffort?: ReasoningEffort
  selectedModelId?: string
  sendMessageOnEnter: boolean
  showReasoningEffortSelector?: boolean
}

const MessageRow = memo(
  function MessageRow({
    composerFocusSignal,
    composerValue,
    isEditing,
    isSending,
    isStreaming,
    message,
    onCancelEditingMessage,
    onComposerValueChange,
    onEditUserMessage,
    onModelChange,
    onReasoningEffortChange,
    onSendEditedMessage,
    modelOptions,
    reasoningEffort,
    selectedModelId,
    sendMessageOnEnter,
    showReasoningEffortSelector,
  }: MessageRowProps) {
    return (
      <div className={message.role === 'user' ? 'flex min-w-0 justify-end' : 'flex min-w-0 justify-start'}>
        {message.role === 'user' ? (
          isEditing ? (
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
                modelOptions={modelOptions}
                onModelChange={onModelChange}
                onReasoningEffortChange={onReasoningEffortChange}
                reasoningEffort={reasoningEffort}
                selectedModelId={selectedModelId}
                showReasoningEffortSelector={showReasoningEffortSelector}
              />
            </div>
          ) : (
            <div className="-mx-4 w-[calc(100%+2rem)]">
              <UserMessage
                content={message.content}
                onEdit={onEditUserMessage ? () => onEditUserMessage(message.id) : undefined}
              />
            </div>
          )
        ) : (
          <AssistantMessage
            content={message.content}
            isStreaming={isStreaming}
            reasoningCompletedAt={message.reasoningCompletedAt}
            reasoningContent={message.reasoningContent}
            timestamp={message.timestamp}
          />
        )}
      </div>
    )
  },
  (previousProps, nextProps) => {
    if (
      previousProps.message !== nextProps.message ||
      previousProps.isEditing !== nextProps.isEditing ||
      previousProps.isStreaming !== nextProps.isStreaming
    ) {
      return false
    }

    if (previousProps.message.role !== 'user') {
      return true
    }

    if (!previousProps.isEditing && !nextProps.isEditing) {
      return true
    }

    return (
      previousProps.composerValue === nextProps.composerValue &&
      previousProps.composerFocusSignal === nextProps.composerFocusSignal &&
      previousProps.isSending === nextProps.isSending &&
      previousProps.reasoningEffort === nextProps.reasoningEffort &&
      previousProps.selectedModelId === nextProps.selectedModelId &&
      previousProps.sendMessageOnEnter === nextProps.sendMessageOnEnter &&
      previousProps.showReasoningEffortSelector === nextProps.showReasoningEffortSelector &&
      previousProps.modelOptions === nextProps.modelOptions
    )
  },
)

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
  modelOptions,
  onModelChange,
  onReasoningEffortChange,
  reasoningEffort,
  selectedModelId,
  sendMessageOnEnter,
  showReasoningEffortSelector = false,
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
          <MessageRow
            key={msg.id}
            composerFocusSignal={composerFocusSignal}
            composerValue={composerValue}
            isEditing={editingMessageId === msg.id}
            isSending={isSending}
            isStreaming={streamingAssistantMessageId === msg.id}
            message={msg}
            onCancelEditingMessage={onCancelEditingMessage}
            onComposerValueChange={onComposerValueChange}
            onEditUserMessage={onEditUserMessage}
            onModelChange={onModelChange}
            onReasoningEffortChange={onReasoningEffortChange}
            onSendEditedMessage={onSendEditedMessage}
            modelOptions={modelOptions}
            reasoningEffort={reasoningEffort}
            selectedModelId={selectedModelId}
            sendMessageOnEnter={sendMessageOnEnter}
            showReasoningEffortSelector={showReasoningEffortSelector}
          />
        ))}
      </div>
    </div>
  )
}
