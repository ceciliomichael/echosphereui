import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseCodexIdTokenClaims } from './jwt'
import type { StoredCodexAuthData } from './store'
import { getCodexAuthDirectoryPath, parseStoredCodexAuthData } from './store'

export interface StoredCodexAccountData extends StoredCodexAuthData {
  email: string | null
  label: string
  updated_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function getCodexAccountsDirectoryPath() {
  return path.join(getCodexAuthDirectoryPath(), 'accounts')
}

export function getStoredCodexAccountFilePath(accountId: string) {
  return path.join(getCodexAccountsDirectoryPath(), `${accountId}.json`)
}

async function ensureCodexAccountsDirectory() {
  await fs.mkdir(getCodexAccountsDirectoryPath(), { recursive: true })
}

function toStoredCodexAccountData(input: unknown): StoredCodexAccountData | null {
  const authData = parseStoredCodexAuthData(input)
  if (!authData) {
    return null
  }

  const candidate = isRecord(input) ? input : {}
  const tokenClaims = parseCodexIdTokenClaims(authData.tokens.id_token)
  const email = tokenClaims.email

  const label = hasText(candidate.label) ? candidate.label.trim() : email ?? authData.tokens.account_id
  const updatedAt = hasText(candidate.updated_at) ? candidate.updated_at : new Date().toISOString()

  return {
    ...authData,
    email,
    label,
    updated_at: updatedAt,
  }
}

export async function readStoredCodexAccount(accountId: string): Promise<StoredCodexAccountData | null> {
  const filePath = getStoredCodexAccountFilePath(accountId)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return toStoredCodexAccountData(JSON.parse(raw) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function listStoredCodexAccounts(): Promise<Array<{ filePath: string; account: StoredCodexAccountData }>> {
  await ensureCodexAccountsDirectory()
  const entries = await fs.readdir(getCodexAccountsDirectoryPath(), { withFileTypes: true })

  const accountFiles = entries.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
  const results = await Promise.all(
    accountFiles.map(async (entry) => {
      const filePath = path.join(getCodexAccountsDirectoryPath(), entry.name)
      try {
        const raw = await fs.readFile(filePath, 'utf8')
        const parsed = toStoredCodexAccountData(JSON.parse(raw) as unknown)
        if (!parsed) {
          return null
        }

        return { filePath, account: parsed }
      } catch {
        return null
      }
    }),
  )

  return results.filter((result): result is { filePath: string; account: StoredCodexAccountData } => result !== null)
}

export async function upsertStoredCodexAccount(authData: StoredCodexAuthData, label?: string) {
  const tokenClaims = parseCodexIdTokenClaims(authData.tokens.id_token)
  const email = tokenClaims.email
  const resolvedLabel = label && label.trim().length > 0 ? label.trim() : email ?? authData.tokens.account_id
  const account: StoredCodexAccountData = {
    ...authData,
    email,
    label: resolvedLabel,
    updated_at: new Date().toISOString(),
  }

  const filePath = getStoredCodexAccountFilePath(authData.tokens.account_id)
  await ensureCodexAccountsDirectory()
  await fs.writeFile(filePath, `${JSON.stringify(account, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return { filePath, account }
}

export async function deleteStoredCodexAccount(accountId: string) {
  const filePath = getStoredCodexAccountFilePath(accountId)
  await fs.unlink(filePath)
}

