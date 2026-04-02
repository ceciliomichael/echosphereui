import assert from 'node:assert/strict'
import test from 'node:test'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'
import {
  collectToolCalls,
  toToolCallList,
  type ToolCallAccumulator,
} from '../../electron/chat/openaiCompatible/toolCallStreaming'

function createToolCallChunk(
  index: number,
  id: string,
  name: string | undefined,
  argumentsText: string | undefined,
): ChatCompletionChunk {
  return {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              function: {
                ...(argumentsText !== undefined ? { arguments: argumentsText } : {}),
                ...(name !== undefined ? { name } : {}),
              },
              id,
              index,
            },
          ],
        },
        finish_reason: null,
        index: 0,
        logprobs: null,
      },
    ],
    created: 1_700_000_000,
    id: `chunk-${id}-${index}`,
    model: 'test-model',
    object: 'chat.completion.chunk',
  } as ChatCompletionChunk
}

function createLegacyFunctionCallChunk(name: string | undefined, argumentsText: string | undefined): ChatCompletionChunk {
  return {
    choices: [
      {
        delta: {
          function_call: {
            ...(argumentsText !== undefined ? { arguments: argumentsText } : {}),
            ...(name !== undefined ? { name } : {}),
          },
        },
        finish_reason: null,
        index: 0,
        logprobs: null,
      },
    ],
    created: 1_700_000_000,
    id: `legacy-fn-${name ?? 'unknown'}`,
    model: 'test-model',
    object: 'chat.completion.chunk',
  } as ChatCompletionChunk
}

function createTerminalMessageToolCallChunk(index: number, id: string, name: string, argumentsText: string): ChatCompletionChunk {
  return {
    choices: [
      {
        delta: {},
        finish_reason: 'tool_calls',
        index: 0,
        logprobs: null,
        message: {
          role: 'assistant',
          tool_calls: [
            {
              function: {
                arguments: argumentsText,
                name,
              },
              id,
              index,
              type: 'function',
            },
          ],
        },
      },
    ],
    created: 1_700_000_000,
    id: `terminal-tool-${id}-${index}`,
    model: 'test-model',
    object: 'chat.completion.chunk',
  } as ChatCompletionChunk
}

function createDeltaSingularToolCallChunk(index: number, id: string, name: string, argumentsText: string): ChatCompletionChunk {
  return {
    choices: [
      {
        delta: {
          tool_call: {
            function: {
              arguments: argumentsText,
              name,
            },
            id,
            index,
            type: 'function',
          },
        },
        finish_reason: null,
        index: 0,
        logprobs: null,
      },
    ],
    created: 1_700_000_000,
    id: `delta-singular-tool-${id}-${index}`,
    model: 'test-model',
    object: 'chat.completion.chunk',
  } as ChatCompletionChunk
}

function createDeltaToolCallsObjectArgumentsChunk(index: number, id: string, name: string): ChatCompletionChunk {
  return {
    choices: [
      {
        delta: {
          tool_calls: {
            function: {
              arguments: {
                absolute_path: 'C:\\repo\\main.tsx',
              },
              name,
            },
            id,
            index,
            type: 'function',
          },
        },
        finish_reason: null,
        index: 0,
        logprobs: null,
      },
    ],
    created: 1_700_000_000,
    id: `delta-object-tool-${id}-${index}`,
    model: 'test-model',
    object: 'chat.completion.chunk',
  } as ChatCompletionChunk
}

test('collectToolCalls marks an earlier tool call ready once a later tool call starts and the earlier JSON is complete', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  const emittedEvents: StreamDeltaEvent[] = []
  const readyToolCalls: string[] = []

  collectToolCalls(
    createToolCallChunk(0, 'call-1', 'list', '{"absolute_path":"C:\\\\repo"}'),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
    (toolCall) => {
      readyToolCalls.push(toolCall.id)
    },
  )

  collectToolCalls(
    createToolCallChunk(1, 'call-2', 'list', '{"absolute_path":"C:\\\\repo\\\\src'),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
    (toolCall) => {
      readyToolCalls.push(toolCall.id)
    },
  )

  collectToolCalls(
    createToolCallChunk(1, 'call-2', undefined, '"}'),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
    (toolCall) => {
      readyToolCalls.push(toolCall.id)
    },
  )

  assert.deepEqual(readyToolCalls, ['call-1'])
  assert.deepEqual(Array.from(readyToolCallIndexes), [0])

  const secondToolDelta = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }> =>
      event.type === 'tool_invocation_delta' && event.invocationId === 'call-2',
  )
  assert.ok(secondToolDelta)
  assert.equal(secondToolDelta.argumentsText, '{"absolute_path":"C:\\\\repo\\\\src"}')

  assert.deepEqual(
    toToolCallList(toolCallsByIndex).map((toolCall) => toolCall.id),
    ['call-1', 'call-2'],
  )
})

test('collectToolCalls assembles legacy function_call deltas into a callable tool invocation', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  const emittedEvents: StreamDeltaEvent[] = []

  collectToolCalls(
    createLegacyFunctionCallChunk('list', '{"absolute_path":"C:\\\\repo'),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
  )

  collectToolCalls(
    createLegacyFunctionCallChunk(undefined, '"}'),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
  )

  const startedEvent = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  assert.ok(startedEvent)
  assert.equal(startedEvent.toolName, 'list')

  const toolCalls = toToolCallList(toolCallsByIndex)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0]?.name, 'list')
  assert.equal(toolCalls[0]?.argumentsText, '{"absolute_path":"C:\\\\repo"}')
})

test('collectToolCalls preserves whitespace-only argument deltas', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()

  collectToolCalls(createToolCallChunk(0, 'call-1', 'list', '{"absolute_path":"hello'), toolCallsByIndex, () => {}, readyToolCallIndexes)
  collectToolCalls(createToolCallChunk(0, 'call-1', undefined, ' '), toolCallsByIndex, () => {}, readyToolCallIndexes)
  collectToolCalls(createToolCallChunk(0, 'call-1', undefined, 'world"}'), toolCallsByIndex, () => {}, readyToolCallIndexes)

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"hello world"}')
})

test('collectToolCalls keeps invocation id stable after tool start when provider later emits a different id', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  const emittedEvents: StreamDeltaEvent[] = []

  collectToolCalls(
    createToolCallChunk(0, 'call_0187c2818fac48089c409468', 'list', ''),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
  )

  collectToolCalls(
    createToolCallChunk(
      0,
      'chatcmpl-tool-8904b7980a18d243',
      undefined,
      '{"absolute_path":"C:\\\\Users\\\\Administrator\\\\Desktop\\\\test"}',
    ),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
  )

  const startedEvent = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  const deltaEvent = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }> =>
      event.type === 'tool_invocation_delta',
  )

  assert.ok(startedEvent)
  assert.ok(deltaEvent)
  assert.equal(startedEvent.invocationId, 'call_0187c2818fac48089c409468')
  assert.equal(deltaEvent.invocationId, 'call_0187c2818fac48089c409468')

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call_0187c2818fac48089c409468')
  assert.equal(toolCall?.name, 'list')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\Users\\\\Administrator\\\\Desktop\\\\test"}')
})

test('collectToolCalls reads terminal non-delta message tool_calls emitted by compatible providers', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  const emittedEvents: StreamDeltaEvent[] = []

  collectToolCalls(
    createTerminalMessageToolCallChunk(0, 'call-terminal-1', 'list', '{"absolute_path":"C:\\\\repo"}'),
    toolCallsByIndex,
    (event) => {
      emittedEvents.push(event)
    },
    readyToolCallIndexes,
  )

  const startedEvent = emittedEvents.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  assert.ok(startedEvent)
  assert.equal(startedEvent.invocationId, 'call-terminal-1')
  assert.equal(startedEvent.toolName, 'list')

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call-terminal-1')
  assert.equal(toolCall?.name, 'list')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\repo"}')
})

test('collectToolCalls supports singular delta.tool_call payloads', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()

  collectToolCalls(
    createDeltaSingularToolCallChunk(0, 'call-singular-1', 'list', '{"absolute_path":"C:\\\\repo"}'),
    toolCallsByIndex,
    () => {},
    readyToolCallIndexes,
  )

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call-singular-1')
  assert.equal(toolCall?.name, 'list')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\repo"}')
})

test('collectToolCalls stringifies object-form function arguments in non-standard chunks', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()

  collectToolCalls(
    createDeltaToolCallsObjectArgumentsChunk(0, 'call-object-1', 'list'),
    toolCallsByIndex,
    () => {},
    readyToolCallIndexes,
  )

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call-object-1')
  assert.equal(toolCall?.name, 'list')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\repo\\\\main.tsx"}')
})

test('toToolCallList ignores malformed tool entries that never receive a name', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>([
    [0, { argumentsText: '{"absolute_path":"C:\\\\repo\\\\a.ts"}', id: 'call-no-name', name: '', startedAt: Date.now() }],
    [1, { argumentsText: '{"absolute_path":"C:\\\\repo\\\\b.ts"}', id: 'call-valid', name: 'list', startedAt: Date.now() }],
  ])

  const toolCalls = toToolCallList(toolCallsByIndex)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0]?.id, 'call-valid')
  assert.equal(toolCalls[0]?.name, 'list')
})
