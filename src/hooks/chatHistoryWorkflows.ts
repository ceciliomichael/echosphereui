import { v4 as uuidv4 } from 'uuid'
import type {
  ChatAttachment,
  ChatMode,
  ConversationFolderSummary,
  ConversationRecord,
  ConversationSummary,
  Message,
  ReasoningEffort,
  ChatProviderId,
  UserMessageRunCheckpoint,
} from '../types/chat'
import { getConversationTitleFromInput } from './chatHistoryViewModels'

export interface ChatHistorySnapshot {
  conversationSummaries: ConversationSummary[]
  folderSummaries: ConversationFolderSummary[]
  initialConversation: ConversationRecord | null
}

interface PersistUserTurnInput {
  activeConversationId: string | null
  chatMode: ChatMode
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
  selectedFolderId: string | null
  targetEditMessageId: string | null
  attachments: ChatAttachment[]
  trimmedText: string
}

interface PersistUserTurnResult {
  conversation: ConversationRecord
  userMessage: Message
}

export interface RevertPreparationResult {
  messageId: string
  redoCheckpointId: string
}

function buildUserMessage(
  trimmedText: string,
  modelId: string,
  providerId: ChatProviderId,
  reasoningEffort: ReasoningEffort,
  attachments: ChatAttachment[],
  runCheckpoint: UserMessageRunCheckpoint,
  forcedId?: string,
): Message {
  return {
    attachments: attachments.length > 0 ? attachments : undefined,
    content: trimmedText,
    id: forcedId ?? uuidv4(),
    modelId,
    providerId,
    reasoningEffort,
    role: 'user',
    runCheckpoint,
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

function findUserMessageOrThrow(conversation: ConversationRecord, messageId: string) {
  const targetMessageIndex = conversation.messages.findIndex(
    (message) => message.id === messageId && message.role === 'user',
  )

  if (targetMessageIndex < 0) {
    throw new Error(`Message not found: ${messageId}`)
  }

  const targetMessage = conversation.messages[targetMessageIndex]
  return {
    targetMessage,
    targetMessageIndex,
  }
}

function resolveRevertCheckpointIdOrThrow(conversation: ConversationRecord, targetMessageIndex: number) {
  const targetMessage = conversation.messages[targetMessageIndex]
  const directCheckpointId = targetMessage?.runCheckpoint?.id
  if (directCheckpointId) {
    return directCheckpointId
  }

  for (let index = targetMessageIndex + 1; index < conversation.messages.length; index += 1) {
    const candidateMessage = conversation.messages[index]
    if (candidateMessage.role !== 'user') {
      continue
    }

    const candidateCheckpointId = candidateMessage.runCheckpoint?.id
    if (candidateCheckpointId) {
      return candidateCheckpointId
    }
  }

  throw new Error('This message and later user messages do not have a workspace checkpoint.')
}

function findUserMessageForRevertOrThrow(conversation: ConversationRecord, messageId: string) {
  const { targetMessage, targetMessageIndex } = findUserMessageOrThrow(conversation, messageId)
  const checkpointId = resolveRevertCheckpointIdOrThrow(conversation, targetMessageIndex)

  return {
    checkpointId,
    targetMessage,
    targetMessageIndex,
  }
}

async function createRunCheckpoint(agentContextRootPath: string) {
  return window.echosphereWorkspace.createCheckpoint({
    workspaceRootPath: agentContextRootPath,
  })
}

export async function loadInitialChatHistory(preferredConversationId?: string | null): Promise<ChatHistorySnapshot> {
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

  const normalizedPreferredConversationId = preferredConversationId?.trim() ?? ''
  const initialConversationId =
    normalizedPreferredConversationId.length > 0 &&
    conversationSummaries.some((conversationSummary) => conversationSummary.id === normalizedPreferredConversationId)
      ? normalizedPreferredConversationId
      : conversationSummaries[0].id

  let initialConversation = await window.echosphereHistory.getConversation(initialConversationId)
  if (!initialConversation && initialConversationId !== conversationSummaries[0].id) {
    initialConversation = await window.echosphereHistory.getConversation(conversationSummaries[0].id)
  }

  return {
    conversationSummaries,
    folderSummaries,
    initialConversation,
  }
}

export async function persistUserTurn(input: PersistUserTurnInput): Promise<PersistUserTurnResult> {
  if (input.targetEditMessageId !== null) {
    if (!input.activeConversationId) {
      throw new Error('Cannot edit a message without an active conversation.')
    }

    const currentConversation = await loadStoredConversationOrThrow(input.activeConversationId)
    const runCheckpoint = await createRunCheckpoint(currentConversation.agentContextRootPath)
    const userMessage = buildUserMessage(
      input.trimmedText,
      input.modelId,
      input.providerId,
      input.reasoningEffort,
      input.attachments,
      runCheckpoint,
      input.targetEditMessageId,
    )
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
      title:
        targetMessageIndex === 0 ? getConversationTitleFromInput(input.trimmedText, input.attachments) : undefined,
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
    const createdConversation = await window.echosphereHistory.createConversation({
      chatMode: input.chatMode,
      folderId: input.selectedFolderId,
    })
    conversationId = createdConversation.id
    currentConversation = createdConversation
  }

  if (!currentConversation) {
    throw new Error(`Conversation not found: ${conversationId}`)
  }

  const shouldUpdateTitle = currentConversation.messages.length === 0
  const runCheckpoint = await createRunCheckpoint(currentConversation.agentContextRootPath)
  const userMessage = buildUserMessage(
    input.trimmedText,
    input.modelId,
    input.providerId,
    input.reasoningEffort,
    input.attachments,
    runCheckpoint,
  )
  const conversation = await window.echosphereHistory.appendMessages({
    conversationId,
    messages: [userMessage],
    title: shouldUpdateTitle ? getConversationTitleFromInput(input.trimmedText, input.attachments) : undefined,
  })

  return {
    conversation,
    userMessage,
  }
}

export async function persistAssistantTurn(conversationId: string, messages: Message[]) {
  return window.echosphereHistory.appendMessages({
    conversationId,
    messages,
  })
}

export async function persistConversationSnapshot(conversationId: string, messages: Message[]) {
  return window.echosphereHistory.replaceMessages({
    conversationId,
    messages,
  })
}

export async function restoreWorkspaceCheckpointForMessage(conversationId: string, messageId: string) {
  const conversation = await loadStoredConversationOrThrow(conversationId)
  const { checkpointId, targetMessage, targetMessageIndex } = findUserMessageForRevertOrThrow(conversation, messageId)

  await window.echosphereWorkspace.restoreCheckpoint(checkpointId)
  return {
    conversation,
    targetMessage,
    targetMessageIndex,
  }
}

export async function prepareRevertSessionForMessage(
  conversationId: string,
  messageId: string,
): Promise<RevertPreparationResult> {
  const conversation = await loadStoredConversationOrThrow(conversationId)
  const { checkpointId, targetMessage } = findUserMessageForRevertOrThrow(conversation, messageId)
  const redoCheckpoint = await window.echosphereWorkspace.createRedoCheckpointFromSource(checkpointId)

  return {
    messageId: targetMessage.id,
    redoCheckpointId: redoCheckpoint.id,
  }
}

export async function revertConversationToMessage(conversationId: string, messageId: string) {
  const { conversation, targetMessageIndex } = await restoreWorkspaceCheckpointForMessage(conversationId, messageId)

  return window.echosphereHistory.replaceMessages({
    conversationId,
    messages: conversation.messages.slice(0, targetMessageIndex + 1),
  })
}
