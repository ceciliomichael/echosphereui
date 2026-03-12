import assert from 'node:assert/strict'
import test from 'node:test'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'
import {
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

test('buildCodexInputMessages groups current-turn tool results into one user-style context item', () => {
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

  assert.deepEqual(buildCodexInputMessages(messages), [
    {
      content: [{ text: 'Inspecting now.', type: 'output_text' }],
      role: 'assistant',
    },
    {
      content: [
        {
          text:
            'Tool result context:\n\nDirectory .\n[F] package.json\n\nFile src/index.ts (lines 1-2)\n```\nexport {}\n```',
          type: 'input_text',
        },
      ],
      role: 'user',
    },
  ])
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
