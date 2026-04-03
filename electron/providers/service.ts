import type { ApiKeyProviderId, ProvidersState, SaveApiKeyProviderInput } from '../../src/types/chat'
import {
  addCodexAccountProviderWithOAuth,
  connectCodexProviderWithOAuth,
  disconnectCodexProvider,
  getCodexProviderStatus,
  switchCodexAccount as switchStoredCodexAccount,
} from './codex/service'
import {
  readStoredApiKeyProviders,
  removeApiKeyProviderConfig,
  saveApiKeyProviderConfig,
  toApiKeyProviderStatuses,
} from './store'

const PROVIDERS_CACHE_TTL_MS = 25_000

let cachedProvidersState: ProvidersState | null = null
let cachedProvidersStateAt = 0
let providersStateRefreshPromise: Promise<ProvidersState> | null = null

function isProvidersStateCacheFresh() {
  if (!cachedProvidersState) {
    return false
  }

  return Date.now() - cachedProvidersStateAt <= PROVIDERS_CACHE_TTL_MS
}

async function rebuildProvidersStateCache() {
  if (providersStateRefreshPromise) {
    return providersStateRefreshPromise
  }

  providersStateRefreshPromise = buildProvidersState()
    .then((nextState) => {
      cachedProvidersState = nextState
      cachedProvidersStateAt = Date.now()
      return nextState
    })
    .finally(() => {
      providersStateRefreshPromise = null
    })

  return providersStateRefreshPromise
}

export async function initializeProvidersState() {
  if (cachedProvidersState) {
    return
  }

  await rebuildProvidersStateCache()
}

export async function getProvidersState() {
  if (isProvidersStateCacheFresh()) {
    return cachedProvidersState
  }

  return rebuildProvidersStateCache()
}

async function refreshProvidersCache() {
  return rebuildProvidersStateCache()
}

async function buildProvidersState(): Promise<ProvidersState> {
  const storedApiKeyProviders = await readStoredApiKeyProviders()
  const codex = await getCodexProviderStatus()

  return {
    apiKeyProviders: toApiKeyProviderStatuses(storedApiKeyProviders),
    codex,
  }
}

export async function connectCodexWithOAuth(openExternal: (url: string) => Promise<void>) {
  await connectCodexProviderWithOAuth(openExternal)
  return refreshProvidersCache()
}

export async function addCodexAccountWithOAuth(openExternal: (url: string) => Promise<void>) {
  await addCodexAccountProviderWithOAuth(openExternal)
  return refreshProvidersCache()
}

export async function disconnectCodex() {
  await disconnectCodexProvider()
  return refreshProvidersCache()
}

export async function switchCodexAccount(accountId: string) {
  await switchStoredCodexAccount(accountId)
  return refreshProvidersCache()
}

export async function saveApiKeyProvider(input: SaveApiKeyProviderInput) {
  await saveApiKeyProviderConfig(input)
  return refreshProvidersCache()
}

export async function removeApiKeyProvider(providerId: ApiKeyProviderId) {
  await removeApiKeyProviderConfig(providerId)
  return refreshProvidersCache()
}
