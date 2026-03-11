import Anthropic from '@anthropic-ai/sdk'
import type { ReasoningEffort } from '../../../src/types/chat'
import { readStoredApiKeyProviders } from '../../providers/store'
import { PROVIDER_SYSTEM_INSTRUCTIONS } from './providerSystemInstructions'

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096
export const ANTHROPIC_MAX_RETRIES = 2
export const ANTHROPIC_REQUEST_TIMEOUT_MS = 120_000
export const ANTHROPIC_SYSTEM_INSTRUCTIONS = PROVIDER_SYSTEM_INSTRUCTIONS

export interface AnthropicProviderConfig {
  apiKey: string
  baseURL: string
}

const ANTHROPIC_MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  'claude-haiku-4.5': 'claude-haiku-4-5',
  'claude-opus-4.5': 'claude-opus-4-5',
  'claude-opus-4.6': 'claude-opus-4-6',
  'claude-sonnet-4.5': 'claude-sonnet-4-5',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
}
const ANTHROPIC_REASONING_EFFORT_MODEL_IDS = new Set(['claude-opus-4-5', 'claude-opus-4-6', 'claude-sonnet-4-6'])

export function buildAnthropicClient(providerConfig: AnthropicProviderConfig) {
  return new Anthropic({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
    maxRetries: ANTHROPIC_MAX_RETRIES,
    timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
  })
}

export async function loadAnthropicProviderConfig(): Promise<AnthropicProviderConfig> {
  const storedProviders = await readStoredApiKeyProviders()
  const providerConfig = storedProviders.anthropic
  const apiKey = providerConfig?.api_key?.trim() ?? ''
  const configuredBaseUrl = providerConfig?.base_url?.trim() ?? ''

  if (!apiKey) {
    throw new Error('Anthropic is not configured. Save an Anthropic API key in Settings > Providers before sending messages.')
  }

  return {
    apiKey,
    baseURL: configuredBaseUrl || ANTHROPIC_DEFAULT_BASE_URL,
  }
}

export function resolveAnthropicModelId(modelId: string) {
  const withoutProviderPrefix = modelId.startsWith('anthropic:') ? modelId.slice('anthropic:'.length) : modelId
  const normalizedAlias =
    withoutProviderPrefix.startsWith('anthropic-')
      ? `claude-${withoutProviderPrefix.slice('anthropic-'.length)}`
      : withoutProviderPrefix

  return ANTHROPIC_MODEL_ID_ALIASES[normalizedAlias] ?? normalizedAlias
}

export function anthropicModelSupportsReasoningEffort(modelId: string) {
  return ANTHROPIC_REASONING_EFFORT_MODEL_IDS.has(resolveAnthropicModelId(modelId))
}

export function toAnthropicReasoningEffort(reasoningEffort: ReasoningEffort): 'low' | 'medium' | 'high' {
  if (reasoningEffort === 'minimal') {
    return 'low'
  }

  if (reasoningEffort === 'xhigh') {
    return 'high'
  }

  return reasoningEffort
}
