import type { ApiKeyProviderId } from '../../../types/chat'

const PROVIDER_DEFAULTS_STORAGE_KEY = 'echosphere:provider-defaults'

interface ProviderDefaultsRecord {
  maxTokens: string
  temperature: string
}

type StoredProviderDefaults = Partial<Record<ApiKeyProviderId, ProviderDefaultsRecord>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function readProviderDefaults(): StoredProviderDefaults {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(PROVIDER_DEFAULTS_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) {
      return {}
    }

    const nextDefaults: StoredProviderDefaults = {}
    for (const [providerId, value] of Object.entries(parsed)) {
      if (!isRecord(value)) {
        continue
      }

      nextDefaults[providerId as ApiKeyProviderId] = {
        maxTokens: hasText(value.maxTokens) ? value.maxTokens : '',
        temperature: hasText(value.temperature) ? value.temperature : '',
      }
    }

    return nextDefaults
  } catch {
    return {}
  }
}

export function writeProviderDefaults(defaults: StoredProviderDefaults) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(PROVIDER_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults))
  } catch {
    // Ignore storage write failures.
  }
}
