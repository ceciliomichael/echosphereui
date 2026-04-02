import assert from 'node:assert/strict'
import test from 'node:test'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'
import {
  buildCodexPayload,
  buildCodexInputMessages,
  getCodexToolDefinitions,
  parseSseResponseStream,
} from '../../electron/chat/providers/codexRuntime'
import type { Message } from '../../src/types/chat'

function createSseResponse(eventPayloads: string[]) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const eventPayload of eventPayloads) {
        controller.enqueue(encoder.encode(eventPayload))
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}

test('getCodexToolDefinitions returns flat function tools for native Responses payloads', () => {
  const codexTools = getCodexToolDefinitions()
  const listTool = codexTools.find((toolDefinition) => toolDefinition.name === 'list')

  assert.ok(Array.isArray(codexTools) && codexTools.length > 0)
  assert.ok(listTool)
  assert.equal(listTool.type, 'function')
  assert.equal(typeof listTool.description, 'string')
  assert.equal(typeof listTool.parameters, 'object')
  assert.equal('function' in listTool, false)
})

test('buildCodexInputMessages serializes tool-role history as function_call_output items', () => {
  const messages: Message[] = [
    {
      content: 'Inspecting now.',
      id: 'assistant-message-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
    {
      content: 'Directory .\n[F] package.json',
      id: 'tool-message-1',
      role: 'tool',
      timestamp: 1_700_000_000_001,
      toolCallId: 'call_123',
    },
    {
      content: 'File src/index.ts (lines 1-2)\n```\nexport {}\n```',
      id: 'tool-message-2',
      role: 'tool',
      timestamp: 1_700_000_000_002,
      toolCallId: 'call_456',
    },
  ]

  const inputMessages = buildCodexInputMessages(messages)

  assert.deepEqual(inputMessages, [
    {
      content: [{ text: 'Inspecting now.', type: 'output_text' }],
      role: 'assistant',
    },
    {
      call_id: 'call_123',
      output: 'Directory .\n[F] package.json',
      type: 'function_call_output',
    },
    {
      call_id: 'call_456',
      output: 'File src/index.ts (lines 1-2)\n```\nexport {}\n```',
      type: 'function_call_output',
    },
  ])
})

test('buildCodexInputMessages keeps assistant content, function calls, and tool outputs for Codex manual replay', () => {
  const messages: Message[] = [
    {
      content: 'I will inspect the workspace.',
      id: 'assistant-message-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"C:/workspace"}',
          completedAt: 1_700_000_000_010,
          id: 'call-1',
          resultContent: 'Listed C:/workspace.',
          startedAt: 1_700_000_000_005,
          state: 'completed',
          toolName: 'list',
        },
      ],
    },
    {
      content: 'Listed C:/workspace.',
      id: 'tool-message-1',
      role: 'tool',
      timestamp: 1_700_000_000_015,
      toolCallId: 'call-1',
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      content: [{
        text: 'I will inspect the workspace.',
        type: 'output_text',
      }],
      role: 'assistant',
    },
    {
      arguments: '{"absolute_path":"C:/workspace"}',
      call_id: 'call-1',
      name: 'list',
      status: 'completed',
      type: 'function_call',
    },
    {
      call_id: 'call-1',
      output: 'Listed C:/workspace.',
      type: 'function_call_output',
    },
  ])
})

test('buildCodexInputMessages inlines assistant reasoning content when present', () => {
  const messages: Message[] = [
    {
      content: 'I will inspect the workspace.',
      id: 'assistant-message-1',
      reasoningContent: 'Need to inspect files first, then patch.',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      content: [{
        text: '<think>\nNeed to inspect files first, then patch.\n</think>\n\nI will inspect the workspace.',
        type: 'output_text',
      }],
      role: 'assistant',
    },
  ])
})

test('buildCodexInputMessages omits inline reasoning block when assistant reasoning is empty', () => {
  const messages: Message[] = [
    {
      content: 'I will inspect the workspace.',
      id: 'assistant-message-1',
      reasoningContent: '   ',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      content: [{
        text: 'I will inspect the workspace.',
        type: 'output_text',
      }],
      role: 'assistant',
    },
  ])
})

test('buildCodexInputMessages keeps tool-only assistant turns as function_call items', () => {
  const messages: Message[] = [
    {
      content: '',
      id: 'assistant-message-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"C:/workspace"}',
          id: 'call-1',
          startedAt: 1_700_000_000_005,
          state: 'completed',
          toolName: 'list',
        },
      ],
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      arguments: '{"absolute_path":"C:/workspace"}',
      call_id: 'call-1',
      name: 'list',
      status: 'completed',
      type: 'function_call',
    },
  ])
})

test('buildCodexInputMessages drops assistant function_call items without matching tool outputs', () => {
  const messages: Message[] = [
    {
      content: '',
      id: 'assistant-message-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"C:/workspace"}',
          id: 'call-orphan',
          startedAt: 1_700_000_000_005,
          state: 'completed',
          toolName: 'list',
        },
      ],
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [])
})

test('buildCodexInputMessages synthesizes missing function_call items for orphan tool outputs', () => {
  const messages: Message[] = [
    {
      content: JSON.stringify({
        body: 'Listed C:/workspace.',
        metadata: {
          arguments: { absolute_path: 'C:/workspace' },
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          summary: 'Listed C:/workspace.',
          toolCallId: 'call-1',
          toolName: 'list',
        },
        schema: 'echosphere.tool_result/v2',
      }),
      id: 'tool-message-1',
      role: 'tool',
      timestamp: 1_700_000_000_015,
      toolCallId: 'call-1',
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      arguments: '{"absolute_path":"C:/workspace"}',
      call_id: 'call-1',
      name: 'list',
      status: 'completed',
      type: 'function_call',
    },
    {
      call_id: 'call-1',
      output: 'Listed C:/workspace.',
      type: 'function_call_output',
    },
  ])
})

test('buildCodexInputMessages does not duplicate synthesized function calls when assistant call already exists earlier', () => {
  const messages: Message[] = [
    {
      content: 'I will inspect the workspace.',
      id: 'assistant-message-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"C:/workspace"}',
          id: 'call-1',
          startedAt: 1_700_000_000_005,
          state: 'completed',
          toolName: 'list',
        },
      ],
    },
    {
      content: JSON.stringify({
        body: 'Listed C:/workspace.',
        metadata: {
          arguments: { absolute_path: 'C:/workspace' },
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          summary: 'Listed C:/workspace.',
          toolCallId: 'call-1',
          toolName: 'list',
        },
        schema: 'echosphere.tool_result/v2',
      }),
      id: 'tool-message-1',
      role: 'tool',
      timestamp: 1_700_000_000_015,
      toolCallId: 'call-1',
    },
  ]

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      content: [{
        text: 'I will inspect the workspace.',
        type: 'output_text',
      }],
      role: 'assistant',
    },
    {
      arguments: '{"absolute_path":"C:/workspace"}',
      call_id: 'call-1',
      name: 'list',
      status: 'completed',
      type: 'function_call',
    },
    {
      call_id: 'call-1',
      output: 'Listed C:/workspace.',
      type: 'function_call_output',
    },
  ])
})

test('buildCodexPayload keeps parallel tool call batching enabled', async () => {
  const payload = await buildCodexPayload(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [],
      modelId: 'gpt-5-codex',
      providerId: 'codex',
      reasoningEffort: 'medium',
    },
  )

  assert.equal(payload.parallel_tool_calls, true)
})

test('buildCodexPayload includes the full manual replay history for Codex backend requests', async () => {
  const payload = await buildCodexPayload(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [
        {
          content: 'I will inspect the workspace.',
          id: 'assistant-message-1',
          role: 'assistant',
          timestamp: 1_700_000_000_000,
          toolInvocations: [
            {
              argumentsText: '{"absolute_path":"C:/workspace"}',
              id: 'call-1',
              startedAt: 1_700_000_000_005,
              state: 'completed',
              toolName: 'list',
            },
          ],
        },
        {
          content: 'Listed C:/workspace.',
          id: 'tool-message-1',
          role: 'tool',
          timestamp: 1_700_000_000_015,
          toolCallId: 'call-1',
        },
      ],
      modelId: 'gpt-5-codex',
      providerId: 'codex',
      reasoningEffort: 'medium',
    },
  )

  assert.deepEqual(payload.input, [
    {
      content: [{
        text: 'I will inspect the workspace.',
        type: 'output_text',
      }],
      role: 'assistant',
    },
    {
      arguments: '{"absolute_path":"C:/workspace"}',
      call_id: 'call-1',
      name: 'list',
      status: 'completed',
      type: 'function_call',
    },
    {
      call_id: 'call-1',
      output: 'Listed C:/workspace.',
      type: 'function_call_output',
    },
  ])
  assert.equal('previous_response_id' in payload, false)
})

test('parseSseResponseStream assembles native Codex tool calls from streamed function call events', async () => {
  const streamEvents = [
    'data: {"type":"response.output_text.delta","delta":"Inspecting..."}\n\n',
    'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_item_1","type":"function_call","call_id":"call_1","name":"list","arguments":""}}\n\n',
    'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_item_1","call_id":"call_1","delta":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\""}\n\n',
    'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_item_1","call_id":"call_1","delta":"}"}\n\n',
    'data: {"type":"response.function_call_arguments.done","output_index":0,"item_id":"fc_item_1","call_id":"call_1","arguments":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\"}"}\n\n',
    'data: [DONE]\n\n',
  ]
  const emittedEvents: StreamDeltaEvent[] = []

  const result = await parseSseResponseStream(
    createSseResponse(streamEvents),
    (event) => {
      emittedEvents.push(event)
    },
    new AbortController().signal,
  )

  assert.equal(result.assistantContent, 'Inspecting...')
  assert.equal(result.responseId, null)
  assert.equal(result.toolCalls.length, 1)
  assert.deepEqual(result.toolCalls[0], {
    argumentsText: '{"absolute_path":"C:\\\\repo"}',
    id: 'call_1',
    name: 'list',
    startedAt: result.toolCalls[0].startedAt,
  })
  assert.ok(result.toolCalls[0].startedAt > 0)

  const startedEvent = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  assert.ok(startedEvent)
  assert.equal(startedEvent.toolName, 'list')

  const deltaEvents = emittedEvents.filter(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }> =>
      event.type === 'tool_invocation_delta',
  )
  assert.equal(deltaEvents.length, 2)
  assert.equal(deltaEvents.at(-1)?.argumentsText, '{"absolute_path":"C:\\\\repo"}')
})

test('parseSseResponseStream exposes tool calls as soon as arguments are finalized', async () => {
  const streamEvents = [
    'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_item_1","type":"function_call","call_id":"call_1","name":"read","arguments":""}}\n\n',
    'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_item_1","call_id":"call_1","delta":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\one.ts\\""}\n\n',
    'data: {"type":"response.function_call_arguments.done","output_index":0,"item_id":"fc_item_1","call_id":"call_1","arguments":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\one.ts\\"}"}\n\n',
    'data: {"type":"response.output_item.added","output_index":1,"item":{"id":"fc_item_2","type":"function_call","call_id":"call_2","name":"read","arguments":""}}\n\n',
    'data: {"type":"response.function_call_arguments.delta","output_index":1,"item_id":"fc_item_2","call_id":"call_2","delta":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\two.ts\\""}\n\n',
    'data: {"type":"response.function_call_arguments.done","output_index":1,"item_id":"fc_item_2","call_id":"call_2","arguments":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\two.ts\\"}"}\n\n',
    'data: [DONE]\n\n',
  ]
  const readyToolCalls: string[] = []
  let sawSecondToolArgumentDelta = false
  let firstToolBecameReadyBeforeSecondDelta = false

  const result = await parseSseResponseStream(
    createSseResponse(streamEvents),
    (event) => {
      if (event.type === 'tool_invocation_delta' && event.invocationId === 'call_2') {
        sawSecondToolArgumentDelta = true
      }
    },
    new AbortController().signal,
    {
      onToolCallReady(toolCall) {
        readyToolCalls.push(toolCall.id)
        if (toolCall.id === 'call_1') {
          firstToolBecameReadyBeforeSecondDelta = !sawSecondToolArgumentDelta
        }
      },
    },
  )

  assert.equal(firstToolBecameReadyBeforeSecondDelta, true)
  assert.deepEqual(readyToolCalls, ['call_1', 'call_2'])
  assert.deepEqual(
    result.toolCalls.map((toolCall) => toolCall.id),
    ['call_1', 'call_2'],
  )
})

test('parseSseResponseStream keeps invocation id stable when codex emits a different call_id mid-stream', async () => {
  const streamEvents = [
    'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_item_1","type":"function_call","call_id":"call_1","name":"list","arguments":""}}\n\n',
    'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_item_1","call_id":"call_1","delta":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\src\\""}\n\n',
    'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_item_1","call_id":"call_renamed","delta":"}"}\n\n',
    'data: {"type":"response.function_call_arguments.done","output_index":0,"item_id":"fc_item_1","call_id":"call_renamed","arguments":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\src\\"}"}\n\n',
    'data: [DONE]\n\n',
  ]
  const emittedEvents: StreamDeltaEvent[] = []

  const result = await parseSseResponseStream(
    createSseResponse(streamEvents),
    (event) => {
      emittedEvents.push(event)
    },
    new AbortController().signal,
  )

  const startedEvent = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  const deltaEvents = emittedEvents.filter(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }> =>
      event.type === 'tool_invocation_delta',
  )

  assert.ok(startedEvent)
  assert.equal(startedEvent.invocationId, 'call_1')
  assert.ok(deltaEvents.length > 0)
  assert.equal(deltaEvents.at(-1)?.invocationId, 'call_1')
  assert.equal(result.toolCalls[0]?.id, 'call_1')
  assert.equal(result.toolCalls[0]?.argumentsText, '{"absolute_path":"C:\\\\repo\\\\src"}')
})

test('parseSseResponseStream captures response id from lifecycle payloads', async () => {
  const streamEvents = [
    'data: {"type":"response.created","response":{"id":"resp_abc123"}}\n\n',
    'data: {"type":"response.output_text.delta","delta":"Done."}\n\n',
    'data: [DONE]\n\n',
  ]

  const result = await parseSseResponseStream(
    createSseResponse(streamEvents),
    () => {},
    new AbortController().signal,
  )

  assert.equal(result.assistantContent, 'Done.')
  assert.equal(result.responseId, 'resp_abc123')
})

test('parseSseResponseStream ignores malformed function_call entries without a name', async () => {
  const streamEvents = [
    'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_item_1","type":"function_call","call_id":"call_1","arguments":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\src\\"}"}}\n\n',
    'data: {"type":"response.function_call_arguments.done","output_index":0,"item_id":"fc_item_1","call_id":"call_1","arguments":"{\\"absolute_path\\":\\"C:\\\\\\\\repo\\\\\\\\src\\"}"}\n\n',
    'data: [DONE]\n\n',
  ]

  const result = await parseSseResponseStream(
    createSseResponse(streamEvents),
    () => {},
    new AbortController().signal,
  )

  assert.deepEqual(result.toolCalls, [])
})
