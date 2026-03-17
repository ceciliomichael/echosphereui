import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversationRecord, Message } from '../../src/types/chat'
import { normalizeConversationRecord } from '../../electron/history/documents'

test('normalizeConversationRecord keeps mistral messages', () => {
  const mistralUserMessage: Message = {
    content: 'hello',
    id: 'user-1',
    modelId: 'mistral-small-latest',
    providerId: 'mistral',
    reasoningEffort: 'medium',
    role: 'user',
    timestamp: Date.now(),
  }

  const inputConversation = {
    chatMode: 'agent',
    id: 'conversation-1',
    messages: [mistralUserMessage],
    title: 'Mistral Chat',
  } satisfies Partial<ConversationRecord> & { id: string }

  const normalizedConversation = normalizeConversationRecord(inputConversation)
  assert.equal(normalizedConversation.messages.length, 1)
  assert.equal(normalizedConversation.messages[0].id, mistralUserMessage.id)
  assert.equal(normalizedConversation.messages[0].providerId, 'mistral')
})
