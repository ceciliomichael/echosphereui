import { v4 as uuidv4 } from 'uuid'
import type {
  ConversationFolderSummary,
  ConversationRecord,
  ConversationSummary,
  Message,
} from '../types/chat'
import { getConversationTitle } from './chatHistoryViewModels'

const TEST_ASSISTANT_REPLY =
  'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm'

export interface ChatHistorySnapshot {
  conversationSummaries: ConversationSummary[]
  folderSummaries: ConversationFolderSummary[]
  initialConversation: ConversationRecord | null
}

interface PersistConversationTurnInput {
  activeConversationId: string | null
  selectedFolderId: string | null
  targetEditMessageId: string | null
  trimmedText: string
}

function buildGeneratedTurn(trimmedText: string, targetEditMessageId: string | null) {
  const timestamp = Date.now()

  const userMessage: Message = {
    id: targetEditMessageId ?? uuidv4(),
    role: 'user',
    content: trimmedText,
    timestamp,
  }

  const assistantMessage: Message = {
    id: uuidv4(),
    role: 'assistant',
    content: TEST_ASSISTANT_REPLY,
    timestamp: timestamp + 1,
  }

  return [userMessage, assistantMessage]
}

async function loadStoredConversationOrThrow(conversationId: string) {
  const conversation = await window.echosphereHistory.getConversation(conversationId)
  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`)
  }

  return conversation
}

export async function loadInitialChatHistory(): Promise<ChatHistorySnapshot> {
  const [conversationSummaries, folderSummaries] = await Promise.all([
    window.echosphereHistory.listConversations(),
    window.echosphereHistory.listFolders(),
  ])

  if (conversationSummaries.length === 0) {
    return {
      conversationSummaries,
      folderSummaries,
      initialConversation: null,
    }
  }

  const initialConversation = await window.echosphereHistory.getConversation(conversationSummaries[0].id)

  return {
    conversationSummaries,
    folderSummaries,
    initialConversation,
  }
}

export async function persistConversationTurn({
  activeConversationId,
  selectedFolderId,
  targetEditMessageId,
  trimmedText,
}: PersistConversationTurnInput): Promise<ConversationRecord> {
  const nextMessages = buildGeneratedTurn(trimmedText, targetEditMessageId)

  if (targetEditMessageId !== null) {
    if (!activeConversationId) {
      throw new Error('Cannot edit a message without an active conversation.')
    }

    const currentConversation = await loadStoredConversationOrThrow(activeConversationId)
    const targetMessageIndex = currentConversation.messages.findIndex(
      (message) => message.id === targetEditMessageId && message.role === 'user',
    )

    if (targetMessageIndex < 0) {
      throw new Error(`Message not found: ${targetEditMessageId}`)
    }

    const rewrittenMessages = [...currentConversation.messages.slice(0, targetMessageIndex), ...nextMessages]

    return window.echosphereHistory.replaceMessages({
      conversationId: currentConversation.id,
      messages: rewrittenMessages,
      title: targetMessageIndex === 0 ? getConversationTitle(trimmedText) : undefined,
    })
  }

  let conversationId = activeConversationId
  let currentConversation: ConversationRecord | null = null

  if (conversationId) {
    currentConversation = await window.echosphereHistory.getConversation(conversationId)
  } else {
    const createdConversation = await window.echosphereHistory.createConversation({ folderId: selectedFolderId })
    conversationId = createdConversation.id
    currentConversation = createdConversation
  }

  const shouldUpdateTitle = Boolean(currentConversation && currentConversation.messages.length === 0)

  return window.echosphereHistory.appendMessages({
    conversationId,
    messages: nextMessages,
    title: shouldUpdateTitle ? getConversationTitle(trimmedText) : undefined,
  })
}
