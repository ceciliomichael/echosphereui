import { parseCodexIdTokenClaims } from '../../providers/codex/jwt'
import {
  readStoredCodexAuthData,
  writeStoredCodexAuthData,
  type StoredCodexAuthData,
} from '../../providers/codex/store'

const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const REFRESH_BUFFER_MS = 60_000

interface RefreshTokenPayload {
  access_token: string
  expires_in?: number
  id_token?: string
  refresh_token?: string
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isTokenExpiredOrNearExpiry(expiresAt: string | undefined) {
  if (!expiresAt) {
    return false
  }

  const expiresAtMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresAtMs)) {
    return false
  }

  return expiresAtMs - Date.now() <= REFRESH_BUFFER_MS
}

function parseRefreshTokenPayload(input: unknown): RefreshTokenPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('OAuth refresh response was not a JSON object.')
  }

  const payload = input as Record<string, unknown>
  if (!hasText(payload.access_token)) {
    throw new Error('OAuth refresh response is missing access_token.')
  }

  return {
    access_token: payload.access_token,
    expires_in: typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in) ? payload.expires_in : undefined,
    id_token: hasText(payload.id_token) ? payload.id_token : undefined,
    refresh_token: hasText(payload.refresh_token) ? payload.refresh_token : undefined,
  }
}

async function refreshCodexAuthData(currentAuthData: StoredCodexAuthData): Promise<StoredCodexAuthData> {
  const body = new URLSearchParams({
    client_id: CODEX_OAUTH_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: currentAuthData.tokens.refresh_token,
    scope: 'openid profile email',
  })

  const response = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Codex OAuth token refresh failed (${response.status}): ${errorText}`)
  }

  const refreshPayload = parseRefreshTokenPayload((await response.json()) as unknown)
  const nextIdToken = refreshPayload.id_token ?? currentAuthData.tokens.id_token
  const tokenClaims = parseCodexIdTokenClaims(nextIdToken)
  const accountId = currentAuthData.tokens.account_id || tokenClaims.accountId

  if (!hasText(accountId)) {
    throw new Error('Unable to determine Codex account ID during token refresh.')
  }

  const now = Date.now()
  const expiresAt =
    typeof refreshPayload.expires_in === 'number' && refreshPayload.expires_in > 0
      ? new Date(now + refreshPayload.expires_in * 1000).toISOString()
      : currentAuthData.expires_at

  const nextAuthData: StoredCodexAuthData = {
    auth_mode: 'chatgpt',
    expires_at: expiresAt,
    last_refresh: new Date(now).toISOString(),
    tokens: {
      access_token: refreshPayload.access_token,
      account_id: accountId,
      id_token: nextIdToken,
      refresh_token: refreshPayload.refresh_token ?? currentAuthData.tokens.refresh_token,
    },
  }

  await writeStoredCodexAuthData(nextAuthData)
  return nextAuthData
}

export async function loadCodexAuthData() {
  const authData = await readStoredCodexAuthData()
  if (!authData) {
    throw new Error('Codex is not connected. Connect Codex in Settings to send messages.')
  }

  if (isTokenExpiredOrNearExpiry(authData.expires_at)) {
    return refreshCodexAuthData(authData)
  }

  return authData
}

export async function forceRefreshCodexAuthData() {
  const authData = await readStoredCodexAuthData()
  if (!authData) {
    throw new Error('Codex is not connected. Connect Codex in Settings to send messages.')
  }

  return refreshCodexAuthData(authData)
}
