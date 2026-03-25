import assert from 'node:assert/strict'
import test from 'node:test'
import { isCodexBackendBaseUrl, isCodexModelFamily, shouldUseCodexNativeRuntime } from '../../electron/chat/providers/providerModelRouting'

test('isCodexModelFamily detects codex-tagged models', () => {
  assert.equal(isCodexModelFamily('gpt-5.3-codex'), true)
  assert.equal(isCodexModelFamily('gpt-5.1-codex-max'), true)
  assert.equal(isCodexModelFamily('gpt-5.4'), true)
  assert.equal(isCodexModelFamily('claude-sonnet-4-6'), false)
})

test('isCodexBackendBaseUrl detects codex backend endpoints', () => {
  assert.equal(isCodexBackendBaseUrl('https://chatgpt.com/backend-api/codex/responses'), true)
  assert.equal(isCodexBackendBaseUrl('https://api.openai.com/v1'), false)
})

test('shouldUseCodexNativeRuntime routes codex provider and codex-like compatible config to native runtime', () => {
  assert.equal(
    shouldUseCodexNativeRuntime({
      modelId: 'gpt-5.4',
      providerId: 'codex',
    }),
    true,
  )

  assert.equal(
    shouldUseCodexNativeRuntime({
      baseUrl: 'https://chatgpt.com/backend-api/codex/responses',
      modelId: 'custom-model',
      providerId: 'openai-compatible',
    }),
    true,
  )

  assert.equal(
    shouldUseCodexNativeRuntime({
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-5.4',
      providerId: 'openai-compatible',
    }),
    true,
  )

  assert.equal(
    shouldUseCodexNativeRuntime({
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4.1',
      providerId: 'openai-compatible',
    }),
    false,
  )
})
