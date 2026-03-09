import { promises as fs } from 'node:fs'
import type { ConversationFolderRecord, ConversationFolderSummary } from '../../src/types/chat'
import { parseFolderStore, serializeFolderStore } from './documents'
import { ensureHistoryDirectory, getFoldersFilePath } from './paths'

export async function readFolderStore() {
  try {
    const raw = await fs.readFile(getFoldersFilePath(), 'utf8')
    return parseFolderStore(raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    console.error('Failed to read folder store', error)
    throw error
  }
}

export async function writeFolderStore(folders: ConversationFolderRecord[]) {
  await ensureHistoryDirectory()
  await fs.writeFile(getFoldersFilePath(), serializeFolderStore(folders), 'utf8')
}

export async function ensureStoredFolderExists(folderId: string | null | undefined) {
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

export function toFolderSummaries(folders: ConversationFolderRecord[]) {
  return [...folders].sort((left, right) => left.createdAt - right.createdAt) satisfies ConversationFolderSummary[]
}
