import { promises as fs } from 'node:fs'
import type { ConversationRecord } from '../../src/types/chat'
import { normalizeConversationRecord } from './documents'

const BACKUP_FILE_SUFFIX = '.bak'

function getBackupConversationFilePath(filePath: string) {
  return `${filePath}.bak`
}

async function readConversationFileExact(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8')
  return normalizeConversationRecord(JSON.parse(raw) as Partial<ConversationRecord> & { id: string })
}

export async function readConversationRecordFromPath(filePath: string) {
  try {
    return await readConversationFileExact(filePath)
  } catch (error) {
    const errno = error as NodeJS.ErrnoException
    const shouldTryBackup = (errno.code === 'ENOENT' || error instanceof SyntaxError) && !filePath.endsWith(BACKUP_FILE_SUFFIX)
    if (!shouldTryBackup) {
      throw error
    }

    return readConversationFileExact(getBackupConversationFilePath(filePath))
  }
}
