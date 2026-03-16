import type {
  AssistantWaitingIndicatorVariant,
  ChatAttachment,
  ChatMode,
  ConversationRecord,
  Message,
} from '../types/chat'
import type { ChatRuntimeSelection } from './chatMessageRuntime'

export interface ConversationRuntimeStatePatch {
  activeStreamId?: string | null
  isSending?: boolean
  isStreamingTextActive?: boolean
  streamingAssistantMessageId?: string | null
  streamingWaitingIndicatorVariant?: AssistantWaitingIndicatorVariant | null
}

export interface ConversationRuntimeSnapshot {
  activeStreamId: string | null
  conversation: ConversationRecord
  isSending?: boolean
}

export interface PersistAndStreamMessageInput {
  activeConversationId: string | null
  activeConversationIdRef: { current: string | null }
  applyConversation: (conversation: ConversationRecord) => void
  appendLocalMessage: (conversationId: string, message: Message) => void
  attachments: ChatAttachment[]
  clearError: () => void
  clearTextStreamingIdleTimeout: (conversationId: string) => void
  completeEditingMessage: () => void
  conversationRuntimeStatesRef: { current: Record<string, ConversationRuntimeSnapshot> }
  draftChatMode: ChatMode
  markTextStreamingPulse: (conversationId: string) => void
  removeLocalMessage: (conversationId: string, messageId: string) => void
  runtimeSelection: ChatRuntimeSelection
  selectedFolderId: string | null
  selectedFolderIdRef: { current: string | null }
  setError: (errorMessage: string | null) => void
  setMainComposerAttachments: (attachments: ChatAttachment[]) => void
  setMainComposerValue: (value: string) => void
  setPendingDraftSendCount: (updater: (currentValue: number) => number) => void
  stopTextStreaming: (conversationId: string) => void
  targetEditMessageId: string | null
  trimmedText: string
  updateConversationRuntimeState: (conversationId: string, input: ConversationRuntimeStatePatch) => void
  updateConversationSummary: (conversation: ConversationRecord) => void
  updateLocalMessage: (conversationId: string, messageId: string, updater: (message: Message) => Message) => void
  upsertConversation: (conversation: ConversationRecord) => void
}
