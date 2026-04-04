import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCodexProviderOptions } from '../../electron/chat/codex/providerOptions'

test('buildCodexProviderOptions preserves the Codex backend-compatible responses settings', () => {
  const providerOptions = buildCodexProviderOptions({
    reasoningEffort: 'medium',
    system: 'You are a coding assistant.',
  })

  assert.equal(providerOptions.openai.instructions, 'You are a coding assistant.')
  assert.equal(providerOptions.openai.store, false)
})
