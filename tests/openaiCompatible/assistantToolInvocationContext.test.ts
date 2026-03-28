import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSerializedAssistantTurnContent,
  buildSerializedAssistantTurnContentWithInlineReasoning,
  buildSerializedAssistantTurnReasoningContent,
} from '../../electron/chat/openaiCompatible/assistantToolInvocationContext'

test('assistant serializer extracts trimmed content and reasoning content independently', () => {
  const message = {
    content: '  Final answer.  ',
    reasoningContent: '  Inspect files before editing.  ',
    role: 'assistant' as const,
  }

  assert.equal(buildSerializedAssistantTurnContent(message), 'Final answer.')
  assert.equal(buildSerializedAssistantTurnReasoningContent(message), 'Inspect files before editing.')
})

test('assistant serializer omits blank reasoning content', () => {
  const message = {
    content: 'Final answer.',
    reasoningContent: '   ',
    role: 'assistant' as const,
  }

  assert.equal(buildSerializedAssistantTurnReasoningContent(message), null)
  assert.equal(buildSerializedAssistantTurnContentWithInlineReasoning(message), 'Final answer.')
})

test('assistant inline serializer injects think block when reasoning content exists', () => {
  const message = {
    content: 'Final answer.',
    reasoningContent: 'Inspect files before editing.',
    role: 'assistant' as const,
  }

  assert.equal(
    buildSerializedAssistantTurnContentWithInlineReasoning(message),
    '<think>\nInspect files before editing.\n</think>\n\nFinal answer.',
  )
})
