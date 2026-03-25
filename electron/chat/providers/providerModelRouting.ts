import type { ChatProviderId } from '../../../src/types/chat'

function normalizeModelId(modelId: string) {
  return modelId.trim().toLowerCase()
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().toLowerCase().replace(/\/+$/, '')
}

export function isCodexModelFamily(modelId: string) {
  const normalizedModelId = normalizeModelId(modelId)
  if (!normalizedModelId) {
    return false
  }

  if (normalizedModelId.includes('codex')) {
    return true
  }

  return /^gpt-5(?:\.\d+)?(?:-(?:mini|pro))?$/.test(normalizedModelId)
}

export function isCodexBackendBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  return normalizedBaseUrl.includes('/backend-api/codex')
}

export function shouldUseCodexNativeRuntime(input: {
  baseUrl?: string | null
  modelId: string
  providerId: ChatProviderId
}) {
  if (input.providerId === 'codex') {
    return true
  }

  if (input.providerId !== 'openai-compatible') {
    return false
  }

  if (input.baseUrl && isCodexBackendBaseUrl(input.baseUrl)) {
    return true
  }

  return isCodexModelFamily(input.modelId)
}
