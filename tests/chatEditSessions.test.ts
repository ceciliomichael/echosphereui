import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRevertSessionKey, mergeConversationEditSessions } from '../src/hooks/chatEditSessions'

test('mergeConversationEditSessions preserves explicit edit sessions and backfills revert-only sessions', () => {
  const mergedSessions = mergeConversationEditSessions(
    {
      'conversation-a': { messageId: 'message-a' },
    },
    {
      'conversation-a': { messageId: 'message-revert-newer', redoCheckpointId: 'redo-a' },
      'conversation-b': { messageId: 'message-b', redoCheckpointId: 'redo-b' },
    },
  )

  assert.deepEqual(mergedSessions, {
    'conversation-a': { messageId: 'message-a' },
    'conversation-b': { messageId: 'message-b' },
  })
})

test('buildRevertSessionKey is stable for a conversation-specific revert session', () => {
  assert.equal(
    buildRevertSessionKey('conversation-a', {
      messageId: 'message-a',
      redoCheckpointId: 'redo-a',
    }),
    'conversation-a:message-a:redo-a',
  )
})
