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
    createToolCallChunk(0, 'call-1', 'read', '{"absolute_path":"C:\\\\repo\\\\Hero.tsx"}'),
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
    createToolCallChunk(1, 'call-2', 'read', '{"absolute_path":"C:\\\\repo\\\\Footer.tsx'),
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
  assert.equal(secondToolDelta.argumentsText, '{"absolute_path":"C:\\\\repo\\\\Footer.tsx"}')

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
    createLegacyFunctionCallChunk('read', '{"absolute_path":"C:\\\\repo\\\\Hero.tsx'),
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
  assert.equal(startedEvent.toolName, 'read')

  const toolCalls = toToolCallList(toolCallsByIndex)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0]?.name, 'read')
  assert.equal(toolCalls[0]?.argumentsText, '{"absolute_path":"C:\\\\repo\\\\Hero.tsx"}')
})

test('collectToolCalls preserves whitespace-only argument deltas', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()

  collectToolCalls(createToolCallChunk(0, 'call-1', 'write', '{"content":"hello'), toolCallsByIndex, () => {}, readyToolCallIndexes)
  collectToolCalls(createToolCallChunk(0, 'call-1', undefined, ' '), toolCallsByIndex, () => {}, readyToolCallIndexes)
  collectToolCalls(createToolCallChunk(0, 'call-1', undefined, 'world"}'), toolCallsByIndex, () => {}, readyToolCallIndexes)

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.argumentsText, '{"content":"hello world"}')
})

test('collectToolCalls reads terminal non-delta message tool_calls emitted by compatible providers', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  const emittedEvents: StreamDeltaEvent[] = []

  collectToolCalls(
    createTerminalMessageToolCallChunk(0, 'call-terminal-1', 'read', '{"absolute_path":"C:\\\\repo\\\\page.tsx"}'),
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
  assert.equal(startedEvent.toolName, 'read')

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call-terminal-1')
  assert.equal(toolCall?.name, 'read')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\repo\\\\page.tsx"}')
})

test('collectToolCalls supports singular delta.tool_call payloads', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()

  collectToolCalls(
    createDeltaSingularToolCallChunk(0, 'call-singular-1', 'read', '{"absolute_path":"C:\\\\repo\\\\single.tsx"}'),
    toolCallsByIndex,
    () => {},
    readyToolCallIndexes,
  )

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call-singular-1')
  assert.equal(toolCall?.name, 'read')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\repo\\\\single.tsx"}')
})

test('collectToolCalls stringifies object-form function arguments in non-standard chunks', () => {
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()

  collectToolCalls(
    createDeltaToolCallsObjectArgumentsChunk(0, 'call-object-1', 'read'),
    toolCallsByIndex,
    () => {},
    readyToolCallIndexes,
  )

  const [toolCall] = toToolCallList(toolCallsByIndex)
  assert.equal(toolCall?.id, 'call-object-1')
  assert.equal(toolCall?.name, 'read')
  assert.equal(toolCall?.argumentsText, '{"absolute_path":"C:\\\\repo\\\\main.tsx"}')
})
