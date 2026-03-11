import type { ApiKeyProviderId } from '../../../types/chat'
import { readProviderDefaults } from './providerLocalDefaults'
import { API_KEY_PROVIDER_SCHEMAS } from './providerSchemas'
import type { ApiKeyProviderDraftMap } from './providerTypes'

export function buildInitialDraftMap(): ApiKeyProviderDraftMap {
  const providerDefaults = readProviderDefaults()

  return API_KEY_PROVIDER_SCHEMAS.reduce<ApiKeyProviderDraftMap>((result, schema) => {
    const savedDefaults = providerDefaults[schema.id]

    result[schema.id] = {
      apiKey: '',
      baseUrl: '',
      maxTokens: savedDefaults?.maxTokens ?? '',
      temperature: savedDefaults?.temperature ?? '',
    }

    return result
  }, {} as ApiKeyProviderDraftMap)
}

export function normalizeOptionalNumericInput(value: string) {
  return value.replace(/[^0-9.]/g, '')
}

export function normalizeOptionalIntegerInput(value: string) {
  return value.replace(/[^0-9]/g, '')
}

export function isValidTemperature(value: string) {
  if (!value.trim()) {
    return true
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 && numberValue <= 2
}

export function isValidMaxTokens(value: string) {
  if (!value.trim()) {
    return true
  }

  return /^[0-9]+$/.test(value) && Number(value) > 0
}

export function operationForProvider(activeOperation: string | null, providerId: ApiKeyProviderId) {
  return {
    isRemoving: activeOperation === `apikey:${providerId}:remove`,
    isSaving: activeOperation === `apikey:${providerId}:save`,
  }
}
