import { GoogleGenAI, ThinkingLevel } from '@google/genai/web'
import type { ReasoningEffort } from '../../../src/types/chat'
import { readStoredApiKeyProviders } from '../../providers/store'
import { PROVIDER_SYSTEM_INSTRUCTIONS } from './providerSystemInstructions'

export const GOOGLE_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
export const GOOGLE_MAX_RETRIES = 2
export const GOOGLE_REQUEST_TIMEOUT_MS = 120_000
export const GOOGLE_SYSTEM_INSTRUCTIONS = PROVIDER_SYSTEM_INSTRUCTIONS

export interface GoogleProviderConfig {
  apiKey: string
  baseURL: string | null
}

const GOOGLE_MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  'google-gemini-3-flash-preview': 'gemini-3-flash-preview',
  'google-gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
  'google-gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
}
const GOOGLE_REASONING_EFFORT_MODEL_IDS = new Set([
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
])

export function buildGoogleClient(providerConfig: GoogleProviderConfig) {
  return new GoogleGenAI({
    apiKey: providerConfig.apiKey,
    ...(providerConfig.baseURL
      ? {
          httpOptions: {
            baseUrl: providerConfig.baseURL,
          },
        }
      : {}),
  })
}

export async function loadGoogleProviderConfig(): Promise<GoogleProviderConfig> {
  const storedProviders = await readStoredApiKeyProviders()
  const providerConfig = storedProviders.google
  const apiKey = providerConfig?.api_key?.trim() ?? ''
  const configuredBaseUrl = providerConfig?.base_url?.trim() ?? ''

  if (!apiKey) {
    throw new Error('Google Gemini is not configured. Save a Google AI Studio API key in Settings > Providers before sending messages.')
  }

  return {
    apiKey,
    baseURL: configuredBaseUrl || null,
  }
}

export function resolveGoogleModelId(modelId: string) {
  const withoutProviderPrefix = modelId.startsWith('google:') ? modelId.slice('google:'.length) : modelId
  return GOOGLE_MODEL_ID_ALIASES[withoutProviderPrefix] ?? withoutProviderPrefix
}

export function googleModelSupportsReasoningEffort(modelId: string) {
  return GOOGLE_REASONING_EFFORT_MODEL_IDS.has(resolveGoogleModelId(modelId))
}

export function toGoogleThinkingLevel(reasoningEffort: ReasoningEffort): ThinkingLevel {
  if (reasoningEffort === 'xhigh') {
    return ThinkingLevel.HIGH
  }

  if (reasoningEffort === 'minimal') {
    return ThinkingLevel.MINIMAL
  }

  if (reasoningEffort === 'low') {
    return ThinkingLevel.LOW
  }

  if (reasoningEffort === 'medium') {
    return ThinkingLevel.MEDIUM
  }

  return ThinkingLevel.HIGH
}
