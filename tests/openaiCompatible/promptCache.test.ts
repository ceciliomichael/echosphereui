import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromptCacheKey } from '../../electron/chat/prompts/promptCache'

test('buildPromptCacheKey is stable for identical prompt prefixes', () => {
  const keyA = buildPromptCacheKey({
    chatMode: 'agent',
    kind: 'responses',
    modelId: 'gpt-5.4',
    providerId: 'openai-compatible',
    systemPrompt: 'system prompt',
    terminalExecutionMode: 'full',
    toolDefinitions: [{ name: 'read' }],
  })
  const keyB = buildPromptCacheKey({
    chatMode: 'agent',
    kind: 'responses',
    modelId: 'gpt-5.4',
    providerId: 'openai-compatible',
    systemPrompt: 'system prompt',
    terminalExecutionMode: 'full',
    toolDefinitions: [{ name: 'read' }],
  })

  assert.equal(keyA, keyB)
})

test('buildPromptCacheKey changes when the prompt prefix changes', () => {
  const keyA = buildPromptCacheKey({
    chatMode: 'agent',
    kind: 'chat-completions',
    modelId: 'gpt-5.4',
    systemPrompt: 'system prompt',
    terminalExecutionMode: 'full',
    toolDefinitions: [{ name: 'read' }],
  })
  const keyB = buildPromptCacheKey({
    chatMode: 'plan',
    kind: 'chat-completions',
    modelId: 'gpt-5.4',
    systemPrompt: 'system prompt',
    terminalExecutionMode: 'full',
    toolDefinitions: [{ name: 'read' }],
  })

  assert.notEqual(keyA, keyB)
})
