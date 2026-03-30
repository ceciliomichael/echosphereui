import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplayableMessageHistory } from '../../electron/chat/openaiCompatible/messageHistory'
import { buildOpenAICompatibleCompletionMessages } from '../../electron/chat/openaiCompatible/runtime'
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

test('buildOpenAICompatibleCompletionMessages preserves assistant tool calls even when assistant text is empty', () => {
  const messages: Message[] = [
    {
      content: '',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"/repo/src/index.ts"}',
          id: 'call-1',
          startedAt: 1,
          state: 'completed',
          toolName: 'read',
        },
      ],
    },
    {
      content: 'File contents here.',
      id: 'tool-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-1',
    },
  ]

  const serializedMessages = buildOpenAICompatibleCompletionMessages(messages)

  assert.equal(serializedMessages.length, 2)
  assert.equal(serializedMessages[0]?.role, 'assistant')
  assert.equal(serializedMessages[0]?.content, null)
  assert.equal(serializedMessages[0]?.tool_calls?.length, 1)
  assert.equal(serializedMessages[0]?.tool_calls?.[0]?.id, 'call-1')
  assert.equal(serializedMessages[0]?.tool_calls?.[0]?.type, 'function')
  assert.equal(serializedMessages[0]?.tool_calls?.[0]?.function.name, 'read')
  assert.equal(serializedMessages[1]?.role, 'tool')
  assert.equal(serializedMessages[1]?.tool_call_id, 'call-1')
})

test('buildOpenAICompatibleCompletionMessages repairs orphan tool messages using structured tool result metadata', () => {
  const messages: Message[] = [
    {
      content: 'Inspecting now.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1,
    },
    {
      content: [
        'Completed tool result. The structured block below is authoritative.',
        '<tool_result>',
        JSON.stringify({
          arguments: { absolute_path: '/repo/src/index.ts' },
          schema: 'echosphere.tool_result/v1',
          semantics: {
            path: '/repo/src/index.ts',
            startLine: 1,
          },
          status: 'success',
          summary: 'Read src/index.ts lines 1-2.',
          toolCallId: 'call-1',
          toolName: 'read',
        }),
        '</tool_result>',
        '<tool_result_body>',
        'export const value = 1;',
        '</tool_result_body>',
      ].join('\n'),
      id: 'tool-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-1',
    },
  ]

  const serializedMessages = buildOpenAICompatibleCompletionMessages(messages)

  assert.equal(serializedMessages.length, 3)
  assert.equal(serializedMessages[1]?.role, 'assistant')
  assert.equal(serializedMessages[1]?.content, null)
  assert.equal(serializedMessages[1]?.tool_calls?.length, 1)
  assert.equal(serializedMessages[1]?.tool_calls?.[0]?.id, 'call-1')
  assert.equal(serializedMessages[1]?.tool_calls?.[0]?.function.name, 'read')
  assert.equal(serializedMessages[2]?.role, 'tool')
  assert.equal(serializedMessages[2]?.tool_call_id, 'call-1')
})

test('buildCodexInputMessages omits tool-role history for Codex Responses payloads', () => {
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
  assert.equal(inputMessages.length, 2)
  assert.equal(inputMessages[0]?.role, 'assistant')
  assert.equal(inputMessages[1]?.role, 'user')
  assert.equal(inputMessages[1]?.content[0]?.type, 'input_text')
  assert.equal(inputMessages[1]?.content[0]?.text, 'Continue from that.')
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
  assert.equal(inputMessages.length, 2)
  assert.equal(inputMessages[0]?.role, 'assistant')
  assert.equal(inputMessages[0]?.content[0]?.type, 'output_text')
  assert.match(
    inputMessages[0]?.content[0]?.text ?? '',
    /<think>\nNeed to inspect project files before editing\.\n<\/think>\n\nInspecting now\./u,
  )
  assert.equal(inputMessages[1]?.role, 'user')
  assert.equal(inputMessages[1]?.content[0]?.type, 'input_text')
  assert.equal(inputMessages[1]?.content[0]?.text, 'Continue from that.')
})
