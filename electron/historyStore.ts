import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type {
  AppendConversationMessagesInput,
  ConversationRecord,
  ConversationSummary,
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

function getHistoryDirectoryPath() {
  return path.join(app.getPath('home'), ...HISTORY_ROOT_SEGMENTS)
}

function getConversationFilePath(conversationId: string) {
  return path.join(getHistoryDirectoryPath(), `${conversationId}.json`)
}

function getMessageLogPath() {
  return path.join(getHistoryDirectoryPath(), MESSAGE_LOG_FILE_NAME)
}

async function ensureHistoryDirectory() {
  await fs.mkdir(getHistoryDirectoryPath(), { recursive: true })
}

async function readConversationFile(conversationId: string) {
  const raw = await fs.readFile(getConversationFilePath(conversationId), 'utf8')
  return JSON.parse(raw) as ConversationRecord
}

function buildConversationSummary(conversation: ConversationRecord): ConversationSummary {
  const latestMessage = conversation.messages.at(-1)

  return {
    id: conversation.id,
    title: conversation.title,
    preview: latestMessage?.content ?? 'No messages yet',
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
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
    (fileName) => fileName.endsWith('.json') && fileName !== MESSAGE_LOG_FILE_NAME,
  )

  const conversations = await Promise.all(
    conversationFiles.map(async (fileName) => {
      try {
        const raw = await fs.readFile(path.join(getHistoryDirectoryPath(), fileName), 'utf8')
        return JSON.parse(raw) as ConversationRecord
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

export async function createStoredConversation() {
  const timestamp = Date.now()
  const conversation: ConversationRecord = {
    id: randomUUID(),
    title: 'New chat',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  }

  await writeConversationFile(conversation)
  return conversation
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
