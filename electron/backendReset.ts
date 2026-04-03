import type {
  ApiKeyProviderId,
  ContextUsageEstimate,
  ProvidersState,
  SaveApiKeyProviderInput,
  SaveCustomModelInput,
  StartChatStreamInput,
  StartChatStreamResult,
  SubmitToolDecisionInput,
  SubmitToolDecisionResult,
} from '../src/types/chat'

const RESET_MESSAGE = 'Chat backend has been reset. Rebuild the backend before using this feature.'

function buildEmptyProvidersState(): ProvidersState {
  return {
    apiKeyProviders: [],
    codex: {
      accountId: null,
      accounts: [],
      authFilePath: '',
      email: null,
      isAuthenticated: false,
      lastRefreshAt: null,
      tokenExpiresAt: null,
    },
  }
}

export async function initializeBackendResetState() {}

export async function getResetProvidersState() {
  return buildEmptyProvidersState()
}

export async function addResetCodexAccountWithOAuth() {
  return buildEmptyProvidersState()
}

export async function connectResetCodexWithOAuth() {
  return buildEmptyProvidersState()
}

export async function disconnectResetCodex() {
  return buildEmptyProvidersState()
}

export async function switchResetCodexAccount(_accountId: string) {
  return buildEmptyProvidersState()
}

export async function saveResetApiKeyProvider(_input: SaveApiKeyProviderInput) {
  return buildEmptyProvidersState()
}

export async function removeResetApiKeyProvider(_providerId: ApiKeyProviderId) {
  return buildEmptyProvidersState()
}

export async function listResetCustomModels() {
  return []
}

export async function listResetProviderModels(_providerId: ApiKeyProviderId) {
  return []
}

export async function saveResetCustomModel(_input: SaveCustomModelInput) {
  return []
}

export async function removeResetCustomModel(_modelId: string) {
  return []
}

export async function estimateResetChatContextUsage(): Promise<ContextUsageEstimate> {
  return {
    historyTokens: 0,
    maxTokens: 0,
    systemPromptTokens: 0,
    toolResultsTokens: 0,
    totalTokens: 0,
  }
}

export async function startResetChatStream(_input: StartChatStreamInput): Promise<StartChatStreamResult> {
  throw new Error(RESET_MESSAGE)
}

export async function cancelResetChatStream(_streamId: string) {}

export async function submitResetToolDecision(_input: SubmitToolDecisionInput): Promise<SubmitToolDecisionResult> {
  throw new Error(RESET_MESSAGE)
}
