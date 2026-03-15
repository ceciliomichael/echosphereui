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
