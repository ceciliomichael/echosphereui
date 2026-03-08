import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ConversationRecord, Message } from '../src/types/chat'
import {
  buildConversationSummary,
  createMessageLogPayload,
  normalizeConversationRecord,
} from './historyDocuments'
import {
  ensureHistoryDirectory,
  FOLDERS_FILE_NAME,
  getConversationFilePath,
  getHistoryDirectoryPath,
  getMessageLogPath,
  MESSAGE_LOG_FILE_NAME,
} from './historyStoragePaths'

async function readConversationFileByPath(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8')
  return normalizeConversationRecord(JSON.parse(raw) as Partial<ConversationRecord> & { id: string })
}

export async function readConversationFile(conversationId: string) {
  return readConversationFileByPath(getConversationFilePath(conversationId))
}

export async function writeConversationFile(conversation: ConversationRecord) {
  await ensureHistoryDirectory()
  await fs.writeFile(getConversationFilePath(conversation.id), JSON.stringify(conversation, null, 2), 'utf8')
}

export async function appendMessagesToLog(conversationId: string, messages: Message[]) {
  if (messages.length === 0) {
    return
  }

  const payload = createMessageLogPayload(conversationId, messages)
  await ensureHistoryDirectory()
  await fs.appendFile(getMessageLogPath(), `${payload}\n`, 'utf8')
}

export async function listConversationSummaries() {
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
        return await readConversationFileByPath(path.join(getHistoryDirectoryPath(), fileName))
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

export async function deleteConversationFile(conversationId: string) {
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
