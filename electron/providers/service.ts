import type { ApiKeyProviderId, ProvidersState, SaveApiKeyProviderInput } from '../../src/types/chat'
import {
  addCodexAccountProviderWithOAuth,
  connectCodexProviderWithOAuth,
  disconnectCodexProvider,
  getCodexProviderStatus,
  switchCodexAccount as switchCodexAccountInternal,
} from './codex/service'
import {
  readStoredApiKeyProviders,
  removeApiKeyProviderConfig,
  saveApiKeyProviderConfig,
  toApiKeyProviderStatuses,
} from './store'

async function buildProvidersState(): Promise<ProvidersState> {
  const [codex, storedApiKeyProviders] = await Promise.all([getCodexProviderStatus(), readStoredApiKeyProviders()])

  return {
    apiKeyProviders: toApiKeyProviderStatuses(storedApiKeyProviders),
    codex,
  }
}

export async function getProvidersState() {
  return buildProvidersState()
}

export async function connectCodexWithOAuth(openExternal: (url: string) => Promise<void>) {
  await connectCodexProviderWithOAuth(openExternal)
  return buildProvidersState()
}

export async function addCodexAccountWithOAuth(openExternal: (url: string) => Promise<void>) {
  await addCodexAccountProviderWithOAuth(openExternal)
  return buildProvidersState()
}

export async function disconnectCodex() {
  await disconnectCodexProvider()
  return buildProvidersState()
}

export async function switchCodexAccount(accountId: string) {
  await switchCodexAccountInternal(accountId)
  return buildProvidersState()
}

export async function saveApiKeyProvider(input: SaveApiKeyProviderInput) {
  await saveApiKeyProviderConfig(input)
  return buildProvidersState()
}

export async function removeApiKeyProvider(providerId: ApiKeyProviderId) {
  await removeApiKeyProviderConfig(providerId)
  return buildProvidersState()
}
