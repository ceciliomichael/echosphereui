import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { ConversationRecord, Message, UserMessageRunCheckpoint } from '../../src/types/chat'
import {
  buildConversationSummary,
  createMessageLogPayload,
  type MessageLogEntry,
  normalizeConversationRecord,
} from './documents'
import {
  ensureHistoryDirectory,
  FOLDERS_FILE_NAME,
  getConversationFilePath,
  getHistoryDirectoryPath,
  getMessageLogPath,
  MESSAGE_LOG_FILE_NAME,
} from './paths'

const CONVERSATION_FILE_SUFFIX = '.json'
const BACKUP_FILE_SUFFIX = `${CONVERSATION_FILE_SUFFIX}.bak`
const userMessageCheckpointHistoryCache = new Map<string, Map<string, UserMessageRunCheckpoint[]>>()

function getBackupConversationFilePath(conversationFilePath: string) {
  return `${conversationFilePath}.bak`
}

function isBackupConversationFileName(fileName: string) {
  return fileName.endsWith(BACKUP_FILE_SUFFIX)
}

function isPrimaryConversationFileName(fileName: string) {
  return fileName.endsWith(CONVERSATION_FILE_SUFFIX)
}

function normalizeConversationFileNameToId(fileName: string) {
  if (isBackupConversationFileName(fileName)) {
    return fileName.slice(0, -BACKUP_FILE_SUFFIX.length)
  }

  if (isPrimaryConversationFileName(fileName)) {
    return fileName.slice(0, -CONVERSATION_FILE_SUFFIX.length)
  }

  return null
}

function getCheckpointHistoryCacheForConversation(conversationId: string) {
  const normalizedConversationId = conversationId.trim()
  if (normalizedConversationId.length === 0) {
    return null
  }

  const cachedConversation = userMessageCheckpointHistoryCache.get(normalizedConversationId)
  if (cachedConversation) {
    return cachedConversation
  }

  const nextConversationCache = new Map<string, UserMessageRunCheckpoint[]>()
  userMessageCheckpointHistoryCache.set(normalizedConversationId, nextConversationCache)
  return nextConversationCache
}

function updateCachedUserMessageCheckpoints(conversationId: string, messages: Message[]) {
  const conversationCache = getCheckpointHistoryCacheForConversation(conversationId)
  if (!conversationCache) {
    return
  }

  for (const message of messages) {
    if (message.role !== 'user') {
      continue
    }

    const checkpoint = message.runCheckpoint
    if (!checkpoint) {
      continue
    }

    const messageId = message.id.trim()
    if (messageId.length === 0) {
      continue
    }

    const existingHistory = conversationCache.get(messageId) ?? []
    if (existingHistory.some((entry) => entry.id === checkpoint.id)) {
      continue
    }

    conversationCache.set(messageId, [...existingHistory, checkpoint])
  }
}

async function readConversationFileExact(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8')
  return normalizeConversationRecord(JSON.parse(raw) as Partial<ConversationRecord> & { id: string })
}

export async function readConversationFile(conversationId: string) {
  const primaryPath = getConversationFilePath(conversationId)

  try {
    return await readConversationFileExact(primaryPath)
  } catch (error) {
    const errno = error as NodeJS.ErrnoException
    const shouldTryBackup = errno.code === 'ENOENT' || error instanceof SyntaxError
    if (!shouldTryBackup) {
      throw error
    }

    const backupPath = getBackupConversationFilePath(primaryPath)
    return readConversationFileExact(backupPath)
  }
}

async function safeUnlink(filePath: string) {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw error
  }
}

async function safeRename(filePath: string, nextPath: string) {
  try {
    await fs.rename(filePath, nextPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw error
  }

  return true
}

async function writeFileAtomic(targetPath: string, content: string) {
  const directoryPath = path.dirname(targetPath)
  const tempPath = path.join(directoryPath, `${path.basename(targetPath)}.tmp-${process.pid}-${randomUUID()}`)
  const backupPath = getBackupConversationFilePath(targetPath)

  await fs.writeFile(tempPath, content, 'utf8')

  try {
    await fs.rename(tempPath, targetPath)
    return
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EEXIST' && code !== 'EPERM') {
      await safeUnlink(tempPath)
      throw error
    }
  }

  await safeUnlink(backupPath)
  const hadExistingTarget = await safeRename(targetPath, backupPath)

  try {
    await fs.rename(tempPath, targetPath)
  } catch (error) {
    await safeUnlink(tempPath)

    if (hadExistingTarget) {
      try {
        await fs.rename(backupPath, targetPath)
      } catch (restoreError) {
        console.error(`Failed to restore conversation file after a write error: ${targetPath}`, restoreError)
      }
    }

    throw error
  }

  await safeUnlink(backupPath)
}

export async function writeConversationFile(conversation: ConversationRecord) {
  await ensureHistoryDirectory()
  await writeFileAtomic(getConversationFilePath(conversation.id), JSON.stringify(conversation, null, 2))
}

export async function appendMessagesToLog(conversationId: string, messages: Message[]) {
  if (messages.length === 0) {
    return
  }

  const payload = createMessageLogPayload(conversationId, messages)
  await ensureHistoryDirectory()
  await fs.appendFile(getMessageLogPath(), `${payload}\n`, 'utf8')
  updateCachedUserMessageCheckpoints(conversationId, messages)
}

export async function readUserMessageCheckpointHistory(conversationId: string, messageId: string) {
  const conversationCache = getCheckpointHistoryCacheForConversation(conversationId)
  const normalizedMessageId = messageId.trim()
  if (!conversationCache || normalizedMessageId.length === 0) {
    return []
  }

  const cachedHistory = conversationCache.get(normalizedMessageId)
  if (cachedHistory) {
    return [...cachedHistory].sort((left, right) => left.createdAt - right.createdAt)
  }

  await ensureHistoryDirectory()
  const messageLogPath = getMessageLogPath()
  const stream = createReadStream(messageLogPath, { encoding: 'utf8' })
  const reader = createInterface({
    crlfDelay: Infinity,
    input: stream,
  })
  const checkpoints = new Map<string, UserMessageRunCheckpoint>()

  try {
    for await (const line of reader) {
      const trimmedLine = line.trim()
      if (trimmedLine.length === 0) {
        continue
      }

      let parsedEntry: MessageLogEntry
      try {
        parsedEntry = JSON.parse(trimmedLine) as MessageLogEntry
      } catch {
        continue
      }

      if (
        parsedEntry.conversationId !== conversationId ||
        parsedEntry.message.role !== 'user' ||
        parsedEntry.message.id !== normalizedMessageId
      ) {
        continue
      }

      const checkpoint = parsedEntry.message.runCheckpoint
      if (!checkpoint) {
        continue
      }

      checkpoints.set(checkpoint.id, checkpoint)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  } finally {
    reader.close()
    stream.destroy()
  }

  const history = Array.from(checkpoints.values()).sort((left, right) => left.createdAt - right.createdAt)
  conversationCache.set(normalizedMessageId, history)
  return [...history]
}

export async function listConversationSummaries() {
  const conversations = await listConversationRecords()

  return conversations.sort((left, right) => right.updatedAt - left.updatedAt).map(buildConversationSummary)
}

export async function listConversationRecords() {
  await ensureHistoryDirectory()

  const fileNames = await fs.readdir(getHistoryDirectoryPath())

  const conversationFileById = new Map<string, string>()
  for (const fileName of fileNames) {
    if (!isPrimaryConversationFileName(fileName)) {
      continue
    }

    if (fileName === FOLDERS_FILE_NAME || fileName === MESSAGE_LOG_FILE_NAME) {
      continue
    }

    const id = normalizeConversationFileNameToId(fileName)
    if (!id) {
      continue
    }

    conversationFileById.set(id, fileName)
  }

  for (const fileName of fileNames) {
    if (!isBackupConversationFileName(fileName)) {
      continue
    }

    const id = normalizeConversationFileNameToId(fileName)
    if (!id || conversationFileById.has(id)) {
      continue
    }

    conversationFileById.set(id, fileName)
  }

  const conversations = await Promise.all(
    Array.from(conversationFileById.values()).map(async (fileName) => {
      try {
        return await readConversationFileExact(path.join(getHistoryDirectoryPath(), fileName))
      } catch (error) {
        console.error(`Failed to read conversation file: ${fileName}`, error)
        return null
      }
    }),
  )

  return conversations.filter((conversation): conversation is ConversationRecord => conversation !== null)
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
