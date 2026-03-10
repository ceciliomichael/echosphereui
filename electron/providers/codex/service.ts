import { runCodexOAuthFlow } from './oauth'
import {
  deleteStoredCodexAuthData,
  readStoredCodexAuthData,
  toCodexProviderStatus,
  writeStoredCodexAuthData,
} from './store'

export async function getCodexProviderStatus() {
  return toCodexProviderStatus(await readStoredCodexAuthData())
}

export async function connectCodexProviderWithOAuth(openExternal: (url: string) => Promise<void>) {
  const authResult = await runCodexOAuthFlow(openExternal)

  await writeStoredCodexAuthData({
    auth_mode: 'oauth',
    expires_at: authResult.expiresAt ?? undefined,
    last_refresh: authResult.lastRefreshAt,
    tokens: {
      access_token: authResult.accessToken,
      account_id: authResult.accountId,
      id_token: authResult.idToken,
      refresh_token: authResult.refreshToken,
    },
  })

  return getCodexProviderStatus()
}

export async function disconnectCodexProvider() {
  await deleteStoredCodexAuthData()
  return getCodexProviderStatus()
}
