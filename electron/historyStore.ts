import { randomUUID } from 'node:crypto'
import type {
  AppendConversationMessagesInput,
  ConversationRecord,
  CreateConversationFolderInput,
  ReplaceConversationMessagesInput,
  CreateConversationInput,
} from '../src/types/chat'
import {
  appendMessagesToLog,
  deleteConversationFile,
  listConversationSummaries,
  readConversationFile,
  writeConversationFile,
} from './conversationFileStore'
import { ensureStoredFolderExists, readFolderStore, toFolderSummaries, writeFolderStore } from './historyFolderStore'

export async function listStoredConversations() {
  return listConversationSummaries()
}

export async function listStoredFolders() {
  return toFolderSummaries(await readFolderStore())
}

export async function getStoredConversation(conversationId: string) {
  try {
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

  await ensureStoredFolderExists(folderId)

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
  const nextFolder = {
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
  await deleteConversationFile(conversationId)
}
