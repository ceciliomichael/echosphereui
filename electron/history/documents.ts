import type { ConversationFolderRecord, ConversationRecord, ConversationSummary, Message } from '../../src/types/chat'

export interface MessageLogEntry {
  conversationId: string
  message: Message
  loggedAt: number
}

interface FolderStoreDocument {
  folders: ConversationFolderRecord[]
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') {
    return false
  }

  const message = value as Partial<Message>
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.timestamp === 'number'
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
    folderId: typeof conversation.folderId === 'string' ? conversation.folderId : null,
    messages,
  }
}

export function buildConversationSummary(conversation: ConversationRecord): ConversationSummary {
  const latestMessage = conversation.messages.at(-1)

  return {
    id: conversation.id,
    title: conversation.title,
    preview: latestMessage?.content ?? 'No messages yet',
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
