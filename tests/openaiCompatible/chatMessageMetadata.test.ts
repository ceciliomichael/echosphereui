import assert from 'node:assert/strict'
import test from 'node:test'
import { getConversationPreviewContent } from '../../src/lib/chatMessageMetadata'
import type { Message } from '../../src/types/chat'

test('getConversationPreviewContent reflects visible assistant text even when tool invocations are present', () => {
  const messages: Message[] = [
    {
      content: 'Assistant to=run_terminal.run_terminal json {"cmd":"npm run lint"}',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [
        {
          argumentsText: '{"cmd":"npm run lint"}',
          id: 'call-1',
          startedAt: 1,
          state: 'running',
          toolName: 'run_terminal',
        },
      ],
    },
  ]

  assert.equal(
    getConversationPreviewContent(messages),
    'Assistant to=run_terminal.run_terminal json {"cmd":"npm run lint"}',
  )
})
