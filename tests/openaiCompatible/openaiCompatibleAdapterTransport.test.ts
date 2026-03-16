import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldFallbackToChatCompletions } from '../../electron/chat/providers/openaiCompatibleTransportFallback'

test('openai-compatible transport fallback helper returns true for unsupported Responses errors', () => {
  assert.equal(
    shouldFallbackToChatCompletions(
      new Error('404 Not Found: /responses endpoint is unsupported'),
    ),
    true,
  )

  assert.equal(
    shouldFallbackToChatCompletions({
      message: 'unsupported',
      status: 400,
    }),
    true,
  )
})

test('openai-compatible transport fallback helper returns false for non-compatibility transport failures', () => {
  assert.equal(
    shouldFallbackToChatCompletions({
      message: 'upstream timeout',
      status: 500,
    }),
    false,
  )
})
