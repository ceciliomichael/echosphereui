import { isChatAttachment } from '../../src/lib/chatAttachments'
import { getConversationPreviewContent } from '../../src/lib/chatMessageMetadata'
import type {
  ChatMode,
  ConversationFolderRecord,
  ConversationRecord,
  ConversationSummary,
  Message,
} from '../../src/types/chat'

export interface MessageLogEntry {
  conversationId: string
  message: Message
  loggedAt: number
}

interface FolderStoreDocument {
  folders: ConversationFolderRecord[]
}

function normalizeChatMode(value: unknown): ChatMode {
  return value === 'agent' ? 'agent' : 'agent'
}

function isToolInvocationTrace(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }

  const invocation = value as Partial<NonNullable<Message['toolInvocations']>[number]>
  return (
    typeof invocation.id === 'string' &&
    typeof invocation.toolName === 'string' &&
    typeof invocation.argumentsText === 'string' &&
    typeof invocation.startedAt === 'number' &&
    (invocation.completedAt === undefined || typeof invocation.completedAt === 'number') &&
    (invocation.resultContent === undefined || typeof invocation.resultContent === 'string') &&
    (invocation.state === 'running' || invocation.state === 'completed' || invocation.state === 'failed')
  )
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') {
    return false
  }

  const message = value as Partial<Message>
  const hasValidProviderId =
    message.providerId === undefined ||
    message.providerId === 'codex' ||
    message.providerId === 'openai' ||
    message.providerId === 'anthropic' ||
    message.providerId === 'google' ||
    message.providerId === 'openai-compatible'
  const hasValidReasoningEffort =
    message.reasoningEffort === undefined ||
    message.reasoningEffort === 'minimal' ||
    message.reasoningEffort === 'low' ||
    message.reasoningEffort === 'medium' ||
    message.reasoningEffort === 'high' ||
    message.reasoningEffort === 'xhigh'
  const hasValidUserMessageKind =
    message.userMessageKind === undefined ||
    message.userMessageKind === 'human' ||
    message.userMessageKind === 'tool_result'
  const hasValidToolCallId = message.toolCallId === undefined || typeof message.toolCallId === 'string'
  const hasRequiredToolCallId =
    message.role !== 'tool' || (typeof message.toolCallId === 'string' && message.toolCallId.trim().length > 0)
  const hasValidToolInvocations =
    message.toolInvocations === undefined ||
    (Array.isArray(message.toolInvocations) && message.toolInvocations.every((entry) => isToolInvocationTrace(entry)))
  const hasValidAttachments =
    message.attachments === undefined ||
    (Array.isArray(message.attachments) && message.attachments.every((attachment) => isChatAttachment(attachment)))

  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'tool') &&
    typeof message.content === 'string' &&
    typeof message.timestamp === 'number' &&
    (message.modelId === undefined || typeof message.modelId === 'string') &&
    hasValidProviderId &&
    (message.reasoningContent === undefined || typeof message.reasoningContent === 'string') &&
    (message.reasoningCompletedAt === undefined || typeof message.reasoningCompletedAt === 'number') &&
    hasValidReasoningEffort &&
    hasValidUserMessageKind &&
    hasValidToolCallId &&
    hasRequiredToolCallId &&
    hasValidToolInvocations &&
    hasValidAttachments
  )
}

function isConversationFolderRecord(value: unknown): value is ConversationFolderRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const folder = value as Partial<ConversationFolderRecord>
  return (
    typeof folder.id === 'string' &&
    typeof folder.name === 'string' &&
    typeof folder.path === 'string' &&
    typeof folder.createdAt === 'number' &&
    typeof folder.updatedAt === 'number'
  )
}

export function normalizeConversationRecord(
  conversation: Partial<ConversationRecord> & { id: string },
): ConversationRecord {
  const createdAt = typeof conversation.createdAt === 'number' ? conversation.createdAt : Date.now()
  const messages = Array.isArray(conversation.messages) ? conversation.messages.filter(isMessage) : []

  return {
    id: conversation.id,
    title: typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : 'New chat',
    createdAt,
    updatedAt: typeof conversation.updatedAt === 'number' ? conversation.updatedAt : createdAt,
    chatMode: normalizeChatMode(conversation.chatMode),
    agentContextRootPath:
      typeof conversation.agentContextRootPath === 'string' ? conversation.agentContextRootPath.trim() : '',
    folderId: typeof conversation.folderId === 'string' ? conversation.folderId : null,
    messages,
  }
}

export function buildConversationSummary(conversation: ConversationRecord): ConversationSummary {
  return {
    agentContextRootPath: conversation.agentContextRootPath,
    chatMode: conversation.chatMode,
    id: conversation.id,
    title: conversation.title,
    preview: getConversationPreviewContent(conversation.messages),
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    folderId: conversation.folderId,
  }
}

export function parseFolderStore(raw: string) {
  const parsed = JSON.parse(raw) as Partial<FolderStoreDocument>
  const folders = Array.isArray(parsed.folders) ? parsed.folders : []

  return folders
    .filter(isConversationFolderRecord)
    .map((folder) => ({
      ...folder,
      name: folder.name.trim(),
      path: folder.path.trim(),
    }))
}

export function serializeFolderStore(folders: ConversationFolderRecord[]) {
  const payload: FolderStoreDocument = { folders }
  return JSON.stringify(payload, null, 2)
}

export function createMessageLogPayload(conversationId: string, messages: Message[], loggedAt = Date.now()) {
  return messages
    .map((message) =>
      JSON.stringify({
        conversationId,
        message,
        loggedAt,
      } satisfies MessageLogEntry),
    )
    .join('\n')
}
