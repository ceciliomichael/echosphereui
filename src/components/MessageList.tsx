import { memo, useRef } from 'react'
import { isVisibleTranscriptMessage } from '../lib/chatMessageMetadata'
import { useAutoScroll } from '../hooks/useAutoScroll'
import type { AssistantWaitingIndicatorVariant, ChatAttachment, ChatMode, Message, ReasoningEffort } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { ChatInput } from './ChatInput'
import { UserMessage } from './UserMessage'
import type { ChatModeOption } from './chat/ChatModeSelectorField'
import type { ModelSelectorOption } from './chat/ModelSelectorField'

interface MessageListProps {
  chatModeOptions?: readonly ChatModeOption[]
  chatModeSelectorDisabled?: boolean
  conversationId: string | null
  composerAttachments: ChatAttachment[]
  composerValue: string
  composerFocusSignal?: number
  editingMessageId?: string | null
  isSending?: boolean
  messages: Message[]
  onCancelEditingMessage: () => void
  onChatModeChange?: (mode: ChatMode) => void
  onComposerAttachmentsChange: (attachments: ChatAttachment[]) => void
  onComposerValueChange: (value: string) => void
  onEditUserMessage?: (messageId: string) => void
  onModelChange?: (modelId: string) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSendEditedMessage: () => void
  selectedChatMode?: ChatMode
  modelOptions?: readonly ModelSelectorOption[]
  reasoningEffort?: ReasoningEffort
  reasoningEffortOptions?: readonly ReasoningEffort[]
  selectedModelId?: string
  sendMessageOnEnter: boolean
  showReasoningEffortSelector?: boolean
  streamingAssistantMessageId?: string | null
  streamingWaitingIndicatorVariant?: AssistantWaitingIndicatorVariant | null
  streamingTextActive?: boolean
}

interface MessageRowProps {
  chatModeOptions?: readonly ChatModeOption[]
  chatModeSelectorDisabled?: boolean
  composerAttachments: ChatAttachment[]
  composerFocusSignal?: number
  composerValue: string
  isEditing: boolean
  isSending: boolean
  isStreaming: boolean
  message: Message
  onCancelEditingMessage: () => void
  onChatModeChange?: (mode: ChatMode) => void
  onComposerAttachmentsChange: (attachments: ChatAttachment[]) => void
  onComposerValueChange: (value: string) => void
  onEditUserMessage?: (messageId: string) => void
  onModelChange?: (modelId: string) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSendEditedMessage: () => void
  selectedChatMode?: ChatMode
  modelOptions?: readonly ModelSelectorOption[]
  reasoningEffort?: ReasoningEffort
  reasoningEffortOptions?: readonly ReasoningEffort[]
  selectedModelId?: string
  sendMessageOnEnter: boolean
  showReasoningEffortSelector?: boolean
  waitingIndicatorVariant?: AssistantWaitingIndicatorVariant
  isTextStreaming?: boolean
}

const MessageRow = memo(
  function MessageRow({
    chatModeOptions,
    chatModeSelectorDisabled,
    composerAttachments,
    composerFocusSignal,
    composerValue,
    isEditing,
    isSending,
    isStreaming,
    message,
    onCancelEditingMessage,
    onChatModeChange,
    onComposerAttachmentsChange,
    onComposerValueChange,
    onEditUserMessage,
    onModelChange,
    onReasoningEffortChange,
    onSendEditedMessage,
    selectedChatMode,
    modelOptions,
    reasoningEffort,
    reasoningEffortOptions,
    selectedModelId,
    sendMessageOnEnter,
    showReasoningEffortSelector,
    waitingIndicatorVariant,
    isTextStreaming = false,
  }: MessageRowProps) {
    return (
      <div className={message.role === 'user' ? 'flex min-w-0 justify-end' : 'flex min-w-0 justify-start'}>
        {message.role === 'user' ? (
          isEditing ? (
            <div className="-mx-4 w-[calc(100%+2rem)]">
              <ChatInput
                attachments={composerAttachments}
                value={composerValue}
                onAttachmentsChange={onComposerAttachmentsChange}
                onValueChange={onComposerValueChange}
                onSend={onSendEditedMessage}
                onCancelEdit={onCancelEditingMessage}
                chatModeOptions={chatModeOptions}
                chatModeSelectorDisabled={chatModeSelectorDisabled}
                isEditing
                onChatModeChange={onChatModeChange}
                sendOnEnter={sendMessageOnEnter}
                variant="inline"
                focusSignal={composerFocusSignal}
                disabled={isSending}
                selectedChatMode={selectedChatMode}
                modelOptions={modelOptions}
                onModelChange={onModelChange}
                onReasoningEffortChange={onReasoningEffortChange}
                reasoningEffort={reasoningEffort}
                reasoningEffortOptions={reasoningEffortOptions}
                selectedModelId={selectedModelId}
                showReasoningEffortSelector={showReasoningEffortSelector}
              />
            </div>
          ) : (
            <div className="-mx-4 w-[calc(100%+2rem)]">
              <UserMessage
                attachments={message.attachments}
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
            toolInvocations={message.toolInvocations}
            waitingIndicatorVariant={waitingIndicatorVariant}
            isTextStreaming={isTextStreaming}
          />
        )}
      </div>
    )
  },
  (previousProps, nextProps) => {
    if (
      previousProps.message !== nextProps.message ||
      previousProps.isEditing !== nextProps.isEditing ||
      previousProps.isStreaming !== nextProps.isStreaming ||
      previousProps.waitingIndicatorVariant !== nextProps.waitingIndicatorVariant ||
      previousProps.isTextStreaming !== nextProps.isTextStreaming
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
      previousProps.composerAttachments === nextProps.composerAttachments &&
      previousProps.composerFocusSignal === nextProps.composerFocusSignal &&
      previousProps.isSending === nextProps.isSending &&
      previousProps.chatModeSelectorDisabled === nextProps.chatModeSelectorDisabled &&
      previousProps.selectedChatMode === nextProps.selectedChatMode &&
      previousProps.reasoningEffort === nextProps.reasoningEffort &&
      previousProps.selectedModelId === nextProps.selectedModelId &&
      previousProps.sendMessageOnEnter === nextProps.sendMessageOnEnter &&
      previousProps.showReasoningEffortSelector === nextProps.showReasoningEffortSelector &&
      previousProps.modelOptions === nextProps.modelOptions
    )
  },
)

export function MessageList({
  chatModeOptions,
  chatModeSelectorDisabled,
  conversationId,
  composerAttachments,
  messages,
  editingMessageId = null,
  onEditUserMessage,
  composerValue,
  onComposerValueChange,
  onComposerAttachmentsChange,
  onSendEditedMessage,
  onCancelEditingMessage,
  onChatModeChange,
  composerFocusSignal,
  isSending = false,
  selectedChatMode,
  modelOptions,
  onModelChange,
  onReasoningEffortChange,
  reasoningEffort,
  reasoningEffortOptions,
  selectedModelId,
  sendMessageOnEnter,
  showReasoningEffortSelector = false,
  streamingAssistantMessageId = null,
  streamingWaitingIndicatorVariant = null,
  streamingTextActive = false,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const visibleMessages = messages.filter((message) => isVisibleTranscriptMessage(message))

  useAutoScroll(scrollContainerRef, visibleMessages, {
    resetKey: conversationId,
    shouldAutoScroll: true,
  })

  return (
    <div ref={scrollContainerRef} className="scroll-stable flex-1 w-full overflow-y-auto">
      <div className="chat-column mx-auto space-y-2.5 px-4 pb-6 pt-6">
        {visibleMessages.map((msg) => (
          <MessageRow
            key={msg.id}
            chatModeOptions={chatModeOptions}
            chatModeSelectorDisabled={chatModeSelectorDisabled}
            composerAttachments={composerAttachments}
            composerFocusSignal={composerFocusSignal}
            composerValue={composerValue}
            isEditing={editingMessageId === msg.id}
            isSending={isSending}
            isStreaming={streamingAssistantMessageId === msg.id}
            message={msg}
            onCancelEditingMessage={onCancelEditingMessage}
            onChatModeChange={onChatModeChange}
            onComposerAttachmentsChange={onComposerAttachmentsChange}
            onComposerValueChange={onComposerValueChange}
            onEditUserMessage={onEditUserMessage}
            onModelChange={onModelChange}
            onReasoningEffortChange={onReasoningEffortChange}
            onSendEditedMessage={onSendEditedMessage}
            selectedChatMode={selectedChatMode}
            modelOptions={modelOptions}
            reasoningEffort={reasoningEffort}
            reasoningEffortOptions={reasoningEffortOptions}
            selectedModelId={selectedModelId}
            sendMessageOnEnter={sendMessageOnEnter}
            showReasoningEffortSelector={showReasoningEffortSelector}
            waitingIndicatorVariant={streamingAssistantMessageId === msg.id ? streamingWaitingIndicatorVariant ?? 'thinking' : undefined}
            isTextStreaming={streamingAssistantMessageId === msg.id ? streamingTextActive : false}
          />
        ))}
      </div>
    </div>
  )
}
