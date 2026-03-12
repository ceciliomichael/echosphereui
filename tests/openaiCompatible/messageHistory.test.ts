import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplayableMessageHistory } from '../../electron/chat/openaiCompatible/messageHistory'
import { buildCodexInputMessages } from '../../electron/chat/providers/codexRuntime'
import type { Message } from '../../src/types/chat'

test('buildReplayableMessageHistory converts persisted tool messages into synthetic user context', () => {
  const messages: Message[] = [
    {
      content: 'I checked the repo.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
    {
      content: 'Directory .\n|- src/\n`- package.json',
      id: 'tool-1',
      role: 'tool',
      timestamp: 1_700_000_000_010,
      toolCallId: 'call-1',
    },
    {
      content: 'File package.json (lines 1-3)\n```json\n{}\n```',
      id: 'tool-2',
      role: 'tool',
      timestamp: 1_700_000_000_020,
      toolCallId: 'call-2',
    },
    {
      content: 'What did you find?',
      id: 'user-1',
      role: 'user',
      timestamp: 1_700_000_000_030,
    },
  ]

  const replayableMessages = buildReplayableMessageHistory(messages)

  assert.equal(replayableMessages.length, 3)
  assert.equal(replayableMessages[0]?.role, 'assistant')
  assert.equal(replayableMessages[1]?.role, 'user')
  assert.equal(replayableMessages[1]?.userMessageKind, 'tool_result')
  assert.equal(
    replayableMessages[1]?.content,
    'Tool result context:\n\nDirectory .\n|- src/\n`- package.json\n\nFile package.json (lines 1-3)\n```json\n{}\n```',
  )
  assert.equal(replayableMessages[1]?.timestamp, 1_700_000_000_020)
  assert.equal(replayableMessages[2]?.content, 'What did you find?')
  assert.equal(replayableMessages.some((message) => message.role === 'tool'), false)
})

test('buildCodexInputMessages keeps replayed tool context ahead of the next user turn', () => {
  const replayableMessages = buildReplayableMessageHistory([
    {
      content: 'Inspecting now.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
    {
      content: 'Directory .\n[F] package.json',
      id: 'tool-1',
      role: 'tool',
      timestamp: 1_700_000_000_001,
      toolCallId: 'call-1',
    },
    {
      content: 'Please continue from that.',
      id: 'user-1',
      role: 'user',
      timestamp: 1_700_000_000_002,
    },
  ] satisfies Message[])

  assert.deepEqual(buildCodexInputMessages(replayableMessages), [
    {
      content: [{ text: 'Inspecting now.', type: 'output_text' }],
      role: 'assistant',
    },
    {
      content: [{ text: 'Tool result context:\n\nDirectory .\n[F] package.json', type: 'input_text' }],
      role: 'user',
    },
    {
      content: [{ text: 'Please continue from that.', type: 'input_text' }],
      role: 'user',
    },
  ])
})
