import OpenAI from 'openai'
import type { ApiKeyProviderId } from '../../../src/types/chat'
import { readStoredApiKeyProviders } from '../../providers/store'

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
export const OPENAI_COMPATIBLE_FALLBACK_API_KEY = 'echosphere-openai-compatible'
export const OPENAI_MAX_RETRIES = 2
export const OPENAI_REQUEST_TIMEOUT_MS = 120_000
export const OPENAI_SYSTEM_INSTRUCTIONS = 'You are EchoSphere, a helpful coding assistant.'

export type OpenAIProviderId = Extract<ApiKeyProviderId, 'openai' | 'openai-compatible'>

export interface OpenAIProviderConfig {
  apiKey: string
  baseURL: string
  stripAuthorizationHeader: boolean
}

export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function readNestedRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

export function readDeltaText(input: unknown): string | null {
  if (typeof input === 'string' && input.length > 0) {
    return input
  }

  if (typeof input !== 'object' || input === null) {
    return null
  }

  const candidate = input as Record<string, unknown>
  if (typeof candidate.delta === 'string' && candidate.delta.length > 0) {
    return candidate.delta
  }

  if (typeof candidate.text === 'string' && candidate.text.length > 0) {
    return candidate.text
  }

  return null
}

export function readTextLikeValue(input: unknown): string | null {
  if (typeof input === 'string' && input.length > 0) {
    return input
  }

  if (Array.isArray(input)) {
    const combinedValue = input
      .map((entry) => readTextLikeValue(entry))
      .filter((value): value is string => value !== null)
      .join('')

    return combinedValue.length > 0 ? combinedValue : null
  }

  const record = readNestedRecord(input)
  if (!record) {
    return null
  }

  return (
    readDeltaText(record) ??
    readTextLikeValue(record.text) ??
    readTextLikeValue(record.content) ??
    readTextLikeValue(record.reasoning) ??
    readTextLikeValue(record.reasoning_content)
  )
}

function removeAuthorizationHeader(headersInput: HeadersInit | undefined) {
  const headers = new Headers(headersInput)
  headers.delete('Authorization')
  headers.delete('authorization')
  return headers
}

export function buildOpenAIClient(providerConfig: OpenAIProviderConfig) {
  const baseClientOptions = {
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
    maxRetries: OPENAI_MAX_RETRIES,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  }

  if (!providerConfig.stripAuthorizationHeader) {
    return new OpenAI(baseClientOptions)
  }

  return new OpenAI({
    ...baseClientOptions,
    fetch: async (input, init) => {
      const nextInit: RequestInit = {
        ...init,
        headers: removeAuthorizationHeader(init?.headers),
      }

      return fetch(input, nextInit)
    },
  })
}

export async function loadOpenAIProviderConfig(providerId: OpenAIProviderId): Promise<OpenAIProviderConfig> {
  const storedProviders = await readStoredApiKeyProviders()
  const providerConfig = storedProviders[providerId]
  const apiKey = providerConfig?.api_key?.trim() ?? ''
  const configuredBaseUrl = providerConfig?.base_url?.trim() ?? ''

  if (providerId === 'openai') {
    if (!apiKey) {
      throw new Error('OpenAI is not configured. Save an OpenAI API key in Settings > Providers before sending messages.')
    }

    return {
      apiKey,
      baseURL: configuredBaseUrl || OPENAI_DEFAULT_BASE_URL,
      stripAuthorizationHeader: false,
    }
  }

  if (!configuredBaseUrl) {
    throw new Error(
      'OpenAI Compatible is not configured. Save a base URL in Settings > Providers before sending messages.',
    )
  }

  return {
    apiKey: apiKey || OPENAI_COMPATIBLE_FALLBACK_API_KEY,
    baseURL: configuredBaseUrl,
    stripAuthorizationHeader: apiKey.length === 0,
  }
}

function readErrorStatus(error: unknown): number | null {
  const record = readNestedRecord(error)
  const status = record?.status
  return typeof status === 'number' ? status : null
}

export function isUnsupportedReasoningEffortError(error: unknown) {
  const status = readErrorStatus(error)
  if (status !== null && status !== 400 && status !== 404 && status !== 422) {
    return false
  }

  const message = error instanceof Error ? error.message : ''
  const normalizedMessage = message.toLowerCase()
  return normalizedMessage.includes('reasoning_effort') || normalizedMessage.includes('reasoning effort')
}
