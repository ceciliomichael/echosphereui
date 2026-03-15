import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { CodexAccountSummary, CodexProviderConnectionStatus } from '../../../src/types/chat'
import { parseCodexIdTokenClaims } from './jwt'

interface CodexAuthTokens {
  access_token: string
  account_id: string
  id_token: string
  refresh_token: string
}

export type CodexAuthMode = 'chatgpt' | 'oauth'

export interface StoredCodexAuthData {
  auth_mode: CodexAuthMode
  expires_at?: string
  last_refresh: string
  tokens: CodexAuthTokens
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function parseStoredCodexAuthData(input: unknown): StoredCodexAuthData | null {
  if (!isRecord(input)) {
    return null
  }

  const tokensCandidate = input.tokens
  if (!isRecord(tokensCandidate)) {
    return null
  }

  if (
    !hasText(tokensCandidate.id_token) ||
    !hasText(tokensCandidate.access_token) ||
    !hasText(tokensCandidate.refresh_token)
  ) {
    return null
  }

  const parsedClaims = parseCodexIdTokenClaims(tokensCandidate.id_token)
  const accountId = hasText(tokensCandidate.account_id) ? tokensCandidate.account_id : parsedClaims.accountId
  if (!hasText(accountId)) {
    return null
  }

  const lastRefresh = hasText(input.last_refresh) ? input.last_refresh : new Date().toISOString()
  const expiresAt = hasText(input.expires_at) ? input.expires_at : undefined
  const authMode: CodexAuthMode = input.auth_mode === 'oauth' || input.auth_mode === 'chatgpt' ? input.auth_mode : 'chatgpt'

  return {
    auth_mode: authMode,
    expires_at: expiresAt,
    last_refresh: lastRefresh,
    tokens: {
      access_token: tokensCandidate.access_token,
      account_id: accountId,
      id_token: tokensCandidate.id_token,
      refresh_token: tokensCandidate.refresh_token,
    },
  }
}

export function getCodexAuthDirectoryPath() {
  return path.join(app.getPath('home'), '.codex')
}

export function getCodexAuthFilePath() {
  return path.join(getCodexAuthDirectoryPath(), 'auth.json')
}

async function ensureCodexAuthDirectory() {
  await fs.mkdir(getCodexAuthDirectoryPath(), { recursive: true })
}

export async function readStoredCodexAuthData() {
  try {
    const raw = await fs.readFile(getCodexAuthFilePath(), 'utf8')
    const parsed = parseStoredCodexAuthData(JSON.parse(raw) as unknown)

    if (!parsed) {
      throw new Error('Unsupported Codex auth file format.')
    }

    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function writeStoredCodexAuthData(data: StoredCodexAuthData) {
  await ensureCodexAuthDirectory()
  await fs.writeFile(getCodexAuthFilePath(), JSON.stringify(data, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  })
}

export async function deleteStoredCodexAuthData() {
  try {
    await fs.unlink(getCodexAuthFilePath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export function toCodexProviderStatus(
  authData: StoredCodexAuthData | null,
  accounts: CodexAccountSummary[],
): CodexProviderConnectionStatus {
  if (!authData) {
    return {
      accountId: null,
      authFilePath: getCodexAuthFilePath(),
      email: null,
      accounts,
      isAuthenticated: false,
      lastRefreshAt: null,
      tokenExpiresAt: null,
    }
  }

  const tokenClaims = parseCodexIdTokenClaims(authData.tokens.id_token)
  const tokenExpiresAt = authData.expires_at ?? tokenClaims.expiresAt
  const accountId = authData.tokens.account_id || tokenClaims.accountId

  return {
    accountId,
    authFilePath: getCodexAuthFilePath(),
    email: tokenClaims.email,
    accounts,
    isAuthenticated: true,
    lastRefreshAt: authData.last_refresh,
    tokenExpiresAt,
  }
}
