import { v4 as uuidv4 } from 'uuid'
import type {
  ConversationFolderSummary,
  ConversationRecord,
  ConversationSummary,
  Message,
  ReasoningEffort,
  ChatProviderId,
} from '../types/chat'
import { getConversationTitle } from './chatHistoryViewModels'

export interface ChatHistorySnapshot {
  conversationSummaries: ConversationSummary[]
  folderSummaries: ConversationFolderSummary[]
  initialConversation: ConversationRecord | null
}

interface PersistUserTurnInput {
  activeConversationId: string | null
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
  selectedFolderId: string | null
  targetEditMessageId: string | null
  trimmedText: string
}

interface PersistUserTurnResult {
  conversation: ConversationRecord
  userMessage: Message
}

function buildUserMessage(
  trimmedText: string,
  modelId: string,
  providerId: ChatProviderId,
  reasoningEffort: ReasoningEffort,
  forcedId?: string,
): Message {
  return {
    content: trimmedText,
    id: forcedId ?? uuidv4(),
    modelId,
    providerId,
    reasoningEffort,
    role: 'user',
    timestamp: Date.now(),
  }
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

export async function persistUserTurn(input: PersistUserTurnInput): Promise<PersistUserTurnResult> {
  const userMessage = buildUserMessage(
    input.trimmedText,
    input.modelId,
    input.providerId,
    input.reasoningEffort,
    input.targetEditMessageId ?? undefined,
  )

  if (input.targetEditMessageId !== null) {
    if (!input.activeConversationId) {
      throw new Error('Cannot edit a message without an active conversation.')
    }

    const currentConversation = await loadStoredConversationOrThrow(input.activeConversationId)
    const targetMessageIndex = currentConversation.messages.findIndex(
      (message) => message.id === input.targetEditMessageId && message.role === 'user',
    )

    if (targetMessageIndex < 0) {
      throw new Error(`Message not found: ${input.targetEditMessageId}`)
    }

    const rewrittenMessages = [...currentConversation.messages.slice(0, targetMessageIndex), userMessage]
    const conversation = await window.echosphereHistory.replaceMessages({
      conversationId: currentConversation.id,
      messages: rewrittenMessages,
      title: targetMessageIndex === 0 ? getConversationTitle(input.trimmedText) : undefined,
    })

    return {
      conversation,
      userMessage,
    }
  }

  let conversationId = input.activeConversationId
  let currentConversation: ConversationRecord | null = null

  if (conversationId) {
    currentConversation = await window.echosphereHistory.getConversation(conversationId)
  } else {
    const createdConversation = await window.echosphereHistory.createConversation({ folderId: input.selectedFolderId })
    conversationId = createdConversation.id
    currentConversation = createdConversation
  }

  const shouldUpdateTitle = Boolean(currentConversation && currentConversation.messages.length === 0)
  const conversation = await window.echosphereHistory.appendMessages({
    conversationId,
    messages: [userMessage],
    title: shouldUpdateTitle ? getConversationTitle(input.trimmedText) : undefined,
  })

  return {
    conversation,
    userMessage,
  }
}

export async function persistAssistantMessage(conversationId: string, assistantMessage: Message) {
  return window.echosphereHistory.appendMessages({
    conversationId,
    messages: [assistantMessage],
  })
}
