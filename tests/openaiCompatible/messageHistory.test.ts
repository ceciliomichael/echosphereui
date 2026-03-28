import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplayableMessageHistory } from '../../electron/chat/openaiCompatible/messageHistory'
import { buildCodexInputMessages } from '../../electron/chat/providers/codexRuntime'
import type { Message } from '../../src/types/chat'

test('buildReplayableMessageHistory preserves tool-role messages without synthetic user tool_result conversion', () => {
  const messages: Message[] = [
    {
      content: 'Inspecting now.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1,
    },
    {
      content: 'Directory .\n[F] package.json',
      id: 'tool-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-1',
    },
    {
      content: 'Continue from that.',
      id: 'user-1',
      role: 'user',
      timestamp: 3,
    },
  ]

  const replayableMessages = buildReplayableMessageHistory(messages)

  assert.deepEqual(replayableMessages, messages)
})

test('buildCodexInputMessages converts tool-role history to a single tool-output user item for Codex payloads', () => {
  const messages: Message[] = [
    {
      content: 'Inspecting now.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1,
    },
    {
      content: 'Directory .\n[F] package.json',
      id: 'tool-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-1',
    },
    {
      content: 'Continue from that.',
      id: 'user-1',
      role: 'user',
      timestamp: 3,
    },
  ]

  const inputMessages = buildCodexInputMessages(messages)
  assert.equal(inputMessages.length, 3)
  assert.equal(inputMessages[0]?.role, 'assistant')
  assert.equal(inputMessages[1]?.role, 'user')
  assert.equal(inputMessages[2]?.role, 'user')
  assert.match(inputMessages[1]?.content[0]?.text ?? '', /^\[SYSTEM TOOL OUTPUT\]/u)
  assert.match(inputMessages[1]?.content[0]?.text ?? '', /<tool_results>/u)
  assert.match(inputMessages[1]?.content[0]?.text ?? '', /Directory \./u)
})

test('buildCodexInputMessages preserves assistant reasoning in tool-loop follow-up payloads', () => {
  const messages: Message[] = [
    {
      content: 'Inspecting now.',
      id: 'assistant-1',
      reasoningContent: 'Need to inspect project files before editing.',
      role: 'assistant',
      timestamp: 1,
    },
    {
      content: 'Directory .\n[F] package.json',
      id: 'tool-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-1',
    },
    {
      content: 'Continue from that.',
      id: 'user-1',
      role: 'user',
      timestamp: 3,
    },
  ]

  const inputMessages = buildCodexInputMessages(messages)
  assert.equal(inputMessages.length, 3)
  assert.equal(inputMessages[0]?.role, 'assistant')
  assert.equal(inputMessages[0]?.content[0]?.type, 'output_text')
  assert.match(
    inputMessages[0]?.content[0]?.text ?? '',
    /<think>\nNeed to inspect project files before editing\.\n<\/think>\n\nInspecting now\./u,
  )
  assert.equal(inputMessages[1]?.role, 'user')
  assert.match(inputMessages[1]?.content[0]?.text ?? '', /<tool_results>/u)
  assert.equal(inputMessages[2]?.role, 'user')
  assert.equal(inputMessages[2]?.content[0]?.type, 'input_text')
  assert.equal(inputMessages[2]?.content[0]?.text, 'Continue from that.')
})
