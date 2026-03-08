import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type {
  AppendConversationMessagesInput,
  ConversationFolderRecord,
  ConversationFolderSummary,
  ConversationRecord,
  ConversationSummary,
  CreateConversationInput,
  CreateConversationFolderInput,
  Message,
  ReplaceConversationMessagesInput,
} from '../src/types/chat'

interface MessageLogEntry {
  conversationId: string
  message: Message
  loggedAt: number
}

const HISTORY_ROOT_SEGMENTS = ['.echosphere', 'history'] as const
const MESSAGE_LOG_FILE_NAME = 'messages.jsonl'
const FOLDERS_FILE_NAME = 'folders.json'

interface FolderStoreDocument {
  folders: ConversationFolderRecord[]
}

function getHistoryDirectoryPath() {
  return path.join(app.getPath('home'), ...HISTORY_ROOT_SEGMENTS)
}

function getConversationFilePath(conversationId: string) {
  return path.join(getHistoryDirectoryPath(), `${conversationId}.json`)
}

function getMessageLogPath() {
  return path.join(getHistoryDirectoryPath(), MESSAGE_LOG_FILE_NAME)
}

function getFoldersFilePath() {
  return path.join(getHistoryDirectoryPath(), FOLDERS_FILE_NAME)
}

async function ensureHistoryDirectory() {
  await fs.mkdir(getHistoryDirectoryPath(), { recursive: true })
}

async function readConversationFile(conversationId: string) {
  const raw = await fs.readFile(getConversationFilePath(conversationId), 'utf8')
  return normalizeConversationRecord(JSON.parse(raw) as Partial<ConversationRecord> & { id: string })
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

function normalizeConversationRecord(conversation: Partial<ConversationRecord> & { id: string }): ConversationRecord {
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

function buildConversationSummary(conversation: ConversationRecord): ConversationSummary {
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

async function writeConversationFile(conversation: ConversationRecord) {
  await ensureHistoryDirectory()
  await fs.writeFile(
    getConversationFilePath(conversation.id),
    JSON.stringify(conversation, null, 2),
    'utf8',
  )
}

async function readFolderStore() {
  try {
    const raw = await fs.readFile(getFoldersFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<FolderStoreDocument>
    const folders = Array.isArray(parsed.folders) ? parsed.folders : []

    return folders
      .filter((folder): folder is ConversationFolderRecord => {
        return (
          typeof folder?.id === 'string' &&
          typeof folder?.name === 'string' &&
          typeof folder?.path === 'string' &&
          typeof folder?.createdAt === 'number' &&
          typeof folder?.updatedAt === 'number'
        )
      })
      .map((folder) => ({
        ...folder,
        name: folder.name.trim(),
        path: folder.path.trim(),
      }))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    console.error('Failed to read folder store', error)
    throw error
  }
}

async function writeFolderStore(folders: ConversationFolderRecord[]) {
  await ensureHistoryDirectory()
  const payload: FolderStoreDocument = { folders }
  await fs.writeFile(getFoldersFilePath(), JSON.stringify(payload, null, 2), 'utf8')
}

async function ensureFolderExists(folderId: string | null | undefined) {
  if (!folderId) {
    return null
  }

  const folders = await readFolderStore()
  const matchedFolder = folders.find((folder) => folder.id === folderId)
  if (!matchedFolder) {
    throw new Error(`Folder not found: ${folderId}`)
  }

  return matchedFolder
}

async function appendMessagesToLog(conversationId: string, messages: Message[]) {
  if (messages.length === 0) {
    return
  }

  const payload = messages
    .map((message) =>
      JSON.stringify({
        conversationId,
        message,
        loggedAt: Date.now(),
      } satisfies MessageLogEntry),
    )
    .join('\n')

  await ensureHistoryDirectory()
  await fs.appendFile(getMessageLogPath(), `${payload}\n`, 'utf8')
}

export async function listStoredConversations() {
  await ensureHistoryDirectory()

  const fileNames = await fs.readdir(getHistoryDirectoryPath())
  const conversationFiles = fileNames.filter(
    (fileName) =>
      fileName.endsWith('.json') &&
      fileName !== FOLDERS_FILE_NAME &&
      fileName !== MESSAGE_LOG_FILE_NAME,
  )

  const conversations = await Promise.all(
    conversationFiles.map(async (fileName) => {
      try {
        const raw = await fs.readFile(path.join(getHistoryDirectoryPath(), fileName), 'utf8')
        return normalizeConversationRecord(JSON.parse(raw) as Partial<ConversationRecord> & { id: string })
      } catch (error) {
        console.error(`Failed to read conversation file: ${fileName}`, error)
        return null
      }
    }),
  )

  return conversations
    .filter((conversation): conversation is ConversationRecord => conversation !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(buildConversationSummary)
}

export async function listStoredFolders() {
  const folders = await readFolderStore()
  return folders.sort((left, right) => left.createdAt - right.createdAt) satisfies ConversationFolderSummary[]
}

export async function getStoredConversation(conversationId: string) {
  try {
    await ensureHistoryDirectory()
    return await readConversationFile(conversationId)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    console.error(`Failed to load conversation: ${conversationId}`, error)
    throw error
  }
}

export async function createStoredConversation(input?: CreateConversationInput) {
  const timestamp = Date.now()
  const folderId = input?.folderId ?? null

  await ensureFolderExists(folderId)

  const conversation: ConversationRecord = {
    id: randomUUID(),
    title: 'New chat',
    createdAt: timestamp,
    updatedAt: timestamp,
    folderId,
    messages: [],
  }

  await writeConversationFile(conversation)
  return conversation
}

export async function createStoredFolder(input: CreateConversationFolderInput) {
  const name = input.name.trim()
  const folderPath = input.path.trim()

  if (name.length === 0) {
    throw new Error('Folder name is required.')
  }

  if (folderPath.length === 0) {
    throw new Error('Folder path is required.')
  }

  if (name.length > 48) {
    throw new Error('Folder name must be 48 characters or less.')
  }

  const folders = await readFolderStore()
  const duplicateFolder = folders.find(
    (folder) => folder.path.localeCompare(folderPath, undefined, { sensitivity: 'base' }) === 0,
  )
  if (duplicateFolder) {
    throw new Error(`Folder already exists: ${folderPath}`)
  }

  const timestamp = Date.now()
  const nextFolder: ConversationFolderRecord = {
    id: randomUUID(),
    name,
    path: folderPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await writeFolderStore([...folders, nextFolder])
  return nextFolder
}

export async function appendStoredMessages(input: AppendConversationMessagesInput) {
  const existingConversation = await getStoredConversation(input.conversationId)

  if (!existingConversation) {
    throw new Error(`Conversation not found: ${input.conversationId}`)
  }

  const nextConversation: ConversationRecord = {
    ...existingConversation,
    title: input.title?.trim() ? input.title.trim() : existingConversation.title,
    updatedAt: input.messages.at(-1)?.timestamp ?? Date.now(),
    messages: [...existingConversation.messages, ...input.messages],
  }

  await Promise.all([
    writeConversationFile(nextConversation),
    appendMessagesToLog(input.conversationId, input.messages),
  ])

  return nextConversation
}

export async function replaceStoredMessages(input: ReplaceConversationMessagesInput) {
  const existingConversation = await getStoredConversation(input.conversationId)

  if (!existingConversation) {
    throw new Error(`Conversation not found: ${input.conversationId}`)
  }

  const nextConversation: ConversationRecord = {
    ...existingConversation,
    title: input.title?.trim() ? input.title.trim() : existingConversation.title,
    updatedAt: input.messages.at(-1)?.timestamp ?? Date.now(),
    messages: input.messages,
  }

  await writeConversationFile(nextConversation)
  return nextConversation
}

export async function deleteStoredConversation(conversationId: string) {
  try {
    await ensureHistoryDirectory()
    await fs.unlink(getConversationFilePath(conversationId))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    console.error(`Failed to delete conversation: ${conversationId}`, error)
    throw error
  }
}
