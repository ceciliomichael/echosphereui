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
  assert.equal(serializedMessages[2]?.content, 'export const value = 1;')
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

test('buildReplayableMessageHistory preserves earlier reads after a later edit so prior context stays available', () => {
  const readToolContent = JSON.stringify({
    body: 'File src/app.ts (lines 1-2 of 2, complete)\n```ts\n1|old\n2|value\n```',
    metadata: {
      schema: 'echosphere.tool_result/v1',
      semantics: {
        end_line: 2,
        start_line: 1,
      },
      status: 'success',
      subject: { kind: 'file', path: 'src/app.ts' },
      summary: 'Read src/app.ts lines 1-2 of 2 (complete).',
      toolCallId: 'call-read',
      toolName: 'read',
    },
    schema: 'echosphere.tool_result/v2',
  })
  const editToolContent = JSON.stringify({
    body: 'Edited src/app.ts successfully.\nCurrent workspace state for src/app.ts is authoritative.',
    metadata: {
      schema: 'echosphere.tool_result/v1',
      semantics: {
        changed_paths: ['src/app.ts'],
        operation: 'edit',
      },
      status: 'success',
      subject: { kind: 'file', path: 'src/app.ts' },
      summary: 'Applied edits to src/app.ts. The current workspace state for this path is included below and should be treated as authoritative.',
      toolCallId: 'call-edit',
      toolName: 'edit',
    },
    schema: 'echosphere.tool_result/v2',
  })

  const messages: Message[] = [
    {
      content: '',
      id: 'assistant-read',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [{ argumentsText: '{}', id: 'call-read', startedAt: 1, state: 'completed', toolName: 'read' }],
    },
    {
      content: readToolContent,
      id: 'tool-read',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-read',
    },
    {
      content: '',
      id: 'assistant-edit',
      role: 'assistant',
      timestamp: 3,
      toolInvocations: [{ argumentsText: '{}', id: 'call-edit', startedAt: 3, state: 'completed', toolName: 'edit' }],
    },
    {
      content: editToolContent,
      id: 'tool-edit',
      role: 'tool',
      timestamp: 4,
      toolCallId: 'call-edit',
    },
  ]

  const replayableMessages = buildReplayableMessageHistory(messages)
  assert.equal(replayableMessages.some((message) => message.role === 'tool' && message.toolCallId === 'call-read'), true)
  assert.equal(replayableMessages.some((message) => message.role === 'tool' && message.toolCallId === 'call-edit'), true)
})

test('buildReplayableMessageHistory preserves assistant tool invocations for kept tool outputs', () => {
  const readToolContent = JSON.stringify({
    body: 'File src/app.ts (lines 1-2 of 2, complete)\n```ts\n1|old\n2|value\n```',
    metadata: {
      schema: 'echosphere.tool_result/v1',
      semantics: {
        end_line: 2,
        start_line: 1,
      },
      status: 'success',
      subject: { kind: 'file', path: 'src/app.ts' },
      summary: 'Read src/app.ts lines 1-2 of 2 (complete).',
      toolCallId: 'call-read',
      toolName: 'read',
    },
    schema: 'echosphere.tool_result/v2',
  })

  const messages: Message[] = [
    {
      content: '',
      id: 'assistant-read',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"src/app.ts"}',
          id: 'call-read',
          startedAt: 1,
          state: 'completed',
          toolName: 'read',
        },
      ],
    },
    {
      content: readToolContent,
      id: 'tool-read',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-read',
    },
  ]

  const replayableMessages = buildReplayableMessageHistory(messages)
  assert.equal(replayableMessages.length, 2)
  assert.equal(replayableMessages[0]?.role, 'assistant')
  assert.equal(replayableMessages[0]?.toolInvocations?.length, 1)
  assert.equal(replayableMessages[0]?.toolInvocations?.[0]?.id, 'call-read')
  assert.equal(replayableMessages[1]?.role, 'tool')
  assert.equal(replayableMessages[1]?.toolCallId, 'call-read')
})

test('buildCodexInputMessages preserves function_call before function_call_output for replayable tool history', () => {
  const readToolContent = JSON.stringify({
    body: 'File src/app.ts (lines 1-2 of 2, complete)\n```ts\n1|old\n2|value\n```',
    metadata: {
      schema: 'echosphere.tool_result/v1',
      semantics: {
        end_line: 2,
        start_line: 1,
      },
      status: 'success',
      subject: { kind: 'file', path: 'src/app.ts' },
      summary: 'Read src/app.ts lines 1-2 of 2 (complete).',
      toolCallId: 'call-read',
      toolName: 'read',
    },
    schema: 'echosphere.tool_result/v2',
  })

  const replayableMessages = buildReplayableMessageHistory([
    {
      content: '',
      id: 'assistant-read',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"src/app.ts"}',
          id: 'call-read',
          startedAt: 1,
          state: 'completed',
          toolName: 'read',
        },
      ],
    },
    {
      content: readToolContent,
      id: 'tool-read',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-read',
    },
  ])

  const inputMessages = buildCodexInputMessages(replayableMessages)
  assert.equal(inputMessages.length, 2)
  assert.equal(inputMessages[0]?.type, 'function_call')
  assert.equal(inputMessages[0]?.call_id, 'call-read')
  assert.equal(inputMessages[1]?.type, 'function_call_output')
  assert.equal(inputMessages[1]?.call_id, 'call-read')
})

test('buildReplayableMessageHistory drops assistant tool invocations without matching tool outputs', () => {
  const replayableMessages = buildReplayableMessageHistory([
    {
      content: '',
      id: 'assistant-orphan',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"src/app.ts"}',
          id: 'call-orphan',
          startedAt: 1,
          state: 'completed',
          toolName: 'edit',
        },
      ],
    },
  ])

  assert.equal(replayableMessages.length, 0)
})

test('buildReplayableMessageHistory preserves older assistant tool invocations when their tool outputs still exist', () => {
  const editToolContent = (toolCallId: string, body: string) =>
    JSON.stringify({
      body,
      metadata: {
        schema: 'echosphere.tool_result/v1',
        semantics: {
          changed_paths: ['src/app.ts'],
          operation: 'edit',
        },
        status: 'success',
        subject: { kind: 'file', path: 'src/app.ts' },
        summary: `Applied edits to src/app.ts for ${toolCallId}.`,
        toolCallId,
        toolName: 'edit',
      },
      schema: 'echosphere.tool_result/v2',
    })

  const replayableMessages = buildReplayableMessageHistory([
    {
      content: '',
      id: 'assistant-edit-1',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"src/app.ts","old_string":"old","new_string":"new"}',
          id: 'call-edit-1',
          startedAt: 1,
          state: 'completed',
          toolName: 'edit',
        },
      ],
    },
    {
      content: editToolContent('call-edit-1', 'Edited src/app.ts once.'),
      id: 'tool-edit-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-edit-1',
    },
    {
      content: '',
      id: 'assistant-edit-2',
      role: 'assistant',
      timestamp: 3,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"src/app.ts","old_string":"new","new_string":"newer"}',
          id: 'call-edit-2',
          startedAt: 3,
          state: 'completed',
          toolName: 'edit',
        },
      ],
    },
    {
      content: editToolContent('call-edit-2', 'Edited src/app.ts twice.'),
      id: 'tool-edit-2',
      role: 'tool',
      timestamp: 4,
      toolCallId: 'call-edit-2',
    },
  ])

  assert.equal(replayableMessages.some((message) => message.role === 'tool' && message.toolCallId === 'call-edit-1'), true)
  assert.equal(
    replayableMessages.some(
      (message) =>
        message.role === 'assistant' &&
        message.toolInvocations?.some((invocation) => invocation.id === 'call-edit-1') === true,
    ),
    true,
  )
  assert.equal(
    replayableMessages.some(
      (message) =>
        message.role === 'assistant' &&
        message.toolInvocations?.some((invocation) => invocation.id === 'call-edit-2') === true,
    ),
    true,
  )
})

test('buildReplayableMessageHistory preserves multiple reads for the same path', () => {
  const makeReadContent = (toolCallId: string, body: string, startLine: number, endLine: number) =>
    JSON.stringify({
      body,
      metadata: {
        schema: 'echosphere.tool_result/v1',
        semantics: {
          end_line: endLine,
          start_line: startLine,
        },
        status: 'success',
        subject: { kind: 'file', path: 'src/app.ts' },
        summary: `Read src/app.ts lines ${startLine}-${endLine}.`,
        toolCallId,
        toolName: 'read',
      },
      schema: 'echosphere.tool_result/v2',
    })

  const messages: Message[] = [
    {
      content: '',
      id: 'assistant-read-1',
      role: 'assistant',
      timestamp: 1,
      toolInvocations: [{ argumentsText: '{}', id: 'call-read-1', startedAt: 1, state: 'completed', toolName: 'read' }],
    },
    {
      content: makeReadContent('call-read-1', 'first read', 1, 20),
      id: 'tool-read-1',
      role: 'tool',
      timestamp: 2,
      toolCallId: 'call-read-1',
    },
    {
      content: '',
      id: 'assistant-read-2',
      role: 'assistant',
      timestamp: 3,
      toolInvocations: [{ argumentsText: '{}', id: 'call-read-2', startedAt: 3, state: 'completed', toolName: 'read' }],
    },
    {
      content: makeReadContent('call-read-2', 'second read', 21, 40),
      id: 'tool-read-2',
      role: 'tool',
      timestamp: 4,
      toolCallId: 'call-read-2',
    },
  ]

  const replayableMessages = buildReplayableMessageHistory(messages)
  assert.equal(replayableMessages.some((message) => message.role === 'tool' && message.toolCallId === 'call-read-1'), true)
  assert.equal(replayableMessages.some((message) => message.role === 'tool' && message.toolCallId === 'call-read-2'), true)
})
