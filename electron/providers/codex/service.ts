import { runCodexOAuthFlow } from './oauth'
import {
  deleteStoredCodexAuthData,
  readStoredCodexAuthData,
  toCodexProviderStatus,
  writeStoredCodexAuthData,
  type StoredCodexAuthData,
} from './store'
import { listStoredCodexAccounts, readStoredCodexAccount, upsertStoredCodexAccount } from './accounts'
import { parseCodexIdTokenClaims } from './jwt'
import type { CodexAccountSummary } from '../../../src/types/chat'
import { refreshCodexOAuthTokensIfNeeded } from './refresh'
import { fetchCodexUsageSnapshot } from './usage'

const USAGE_FETCH_TIMEOUT_MS = 1_200

async function fetchUsageWithTimeout(input: { accessToken: string; accountId: string }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), USAGE_FETCH_TIMEOUT_MS)

  try {
    return await fetchCodexUsageSnapshot({
      accessToken: input.accessToken,
      accountId: input.accountId,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getCodexProviderStatus() {
  const activeAuthData = await readStoredCodexAuthData()

  if (activeAuthData) {
    const existingAccount = await readStoredCodexAccount(activeAuthData.tokens.account_id)
    await upsertStoredCodexAccount(activeAuthData, existingAccount?.label)
  }

  const storedAccounts = await listStoredCodexAccounts().catch(() => [])
  const activeAccountId = activeAuthData?.tokens.account_id ?? null

  const accounts = await Promise.all(
    storedAccounts.map(async ({ account }) => {
      let refreshedAccount = account

      try {
        if (account.tokens.account_id !== activeAccountId) {
          throw new Error('Skip refresh for inactive accounts.')
        }

        const nextAuthData = await refreshCodexOAuthTokensIfNeeded(account)
        if (
          nextAuthData.tokens.access_token !== account.tokens.access_token ||
          nextAuthData.tokens.refresh_token !== account.tokens.refresh_token ||
          nextAuthData.tokens.id_token !== account.tokens.id_token ||
          nextAuthData.expires_at !== account.expires_at ||
          nextAuthData.last_refresh !== account.last_refresh
        ) {
          refreshedAccount = (await upsertStoredCodexAccount(nextAuthData, account.label)).account

          if (nextAuthData.tokens.account_id === activeAccountId) {
            await writeStoredCodexAuthData(nextAuthData)
          }
        }
      } catch {
        // Ignore refresh failures for non-active accounts; the UI can still surface the stored data.
      }

      const tokenClaims = parseCodexIdTokenClaims(refreshedAccount.tokens.id_token)
      const tokenExpiresAt = refreshedAccount.expires_at ?? tokenClaims.expiresAt ?? null

      let usage = null
      try {
        usage = await fetchUsageWithTimeout({
          accessToken: refreshedAccount.tokens.access_token,
          accountId: refreshedAccount.tokens.account_id,
        })
      } catch {
        usage = null
      }

      const summary: CodexAccountSummary = {
        accountId: refreshedAccount.tokens.account_id,
        email: tokenClaims.email,
        isActive: refreshedAccount.tokens.account_id === activeAccountId,
        label: refreshedAccount.label,
        lastRefreshAt: refreshedAccount.last_refresh ?? null,
        tokenExpiresAt,
        usage,
      }

      return summary
    }),
  )

  accounts.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1
    }

    return left.label.localeCompare(right.label)
  })

  return toCodexProviderStatus(activeAuthData, accounts)
}

export async function connectCodexProviderWithOAuth(openExternal: (url: string) => Promise<void>) {
  const existingAuthData = await readStoredCodexAuthData()
  if (existingAuthData) {
    const existingAccount = await readStoredCodexAccount(existingAuthData.tokens.account_id)
    await upsertStoredCodexAccount(existingAuthData, existingAccount?.label)
  }

  const authResult = await runCodexOAuthFlow(openExternal)

  const nextAuthData: StoredCodexAuthData = {
    auth_mode: 'oauth',
    expires_at: authResult.expiresAt ?? undefined,
    last_refresh: authResult.lastRefreshAt,
    tokens: {
      access_token: authResult.accessToken,
      account_id: authResult.accountId,
      id_token: authResult.idToken,
      refresh_token: authResult.refreshToken,
    },
  }

  await writeStoredCodexAuthData(nextAuthData)
  await upsertStoredCodexAccount(nextAuthData)

  return getCodexProviderStatus()
}

export async function addCodexAccountProviderWithOAuth(openExternal: (url: string) => Promise<void>) {
  return connectCodexProviderWithOAuth(openExternal)
}

export async function disconnectCodexProvider() {
  await deleteStoredCodexAuthData()
  return getCodexProviderStatus()
}

export async function switchCodexAccount(accountId: string) {
  const storedAccount = await readStoredCodexAccount(accountId)

  if (!storedAccount) {
    throw new Error(`Codex account not found: ${accountId}`)
  }

  const refreshed = await refreshCodexOAuthTokensIfNeeded(storedAccount)
  await writeStoredCodexAuthData(refreshed)
  await upsertStoredCodexAccount(refreshed, storedAccount.label)
  return getCodexProviderStatus()
}
