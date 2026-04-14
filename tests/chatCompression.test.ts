import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPRESSION_ACKNOWLEDGEMENT_TEXT,
  buildCompressedHistoryAcknowledgementMessage,
  buildCompressedHistoryMessage,
  parseCompressedHistoryMessage,
} from '../src/lib/chatCompression'

test('buildCompressedHistoryMessage only returns the compressed context payload', () => {
  const summary = 'Goal\nShip the compression update'

  const message = buildCompressedHistoryMessage(summary)

  assert.ok(message.includes('<echosphere:compressed_history>'))
  assert.ok(message.includes('<echosphere:summary>'))
  assert.ok(!message.includes(COMPRESSION_ACKNOWLEDGEMENT_TEXT))
  assert.deepEqual(parseCompressedHistoryMessage(message), { summary })
})

test('buildCompressedHistoryAcknowledgementMessage creates a synthetic assistant turn', () => {
  const message = buildCompressedHistoryAcknowledgementMessage('message-id', 1234)

  assert.deepEqual(message, {
    content: COMPRESSION_ACKNOWLEDGEMENT_TEXT,
    id: 'message-id',
    role: 'assistant',
    timestamp: 1234,
  })
})
