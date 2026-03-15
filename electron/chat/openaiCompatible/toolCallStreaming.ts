import { randomUUID } from 'node:crypto'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import type { OpenAICompatibleToolCall } from './toolTypes'

export interface ToolCallAccumulator {
  argumentsText: string
  id: string
  name: string
  startedAt: number | null
}

const LEGACY_FUNCTION_CALL_INDEX = -1

function hasNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCompleteJsonObject(argumentsText: string) {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    return typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue)
  } catch {
    return false
  }
}

function toToolCall(accumulator: ToolCallAccumulator): OpenAICompatibleToolCall | null {
  if (!accumulator.name.trim()) {
    return null
  }

  return {
    argumentsText: accumulator.argumentsText,
    id: accumulator.id,
    name: accumulator.name,
    startedAt: accumulator.startedAt ?? Date.now(),
  }
}

interface NormalizedToolCallDelta {
  argumentsText?: string
  id?: string
  index: number
  name?: string
}

function toNormalizedToolCallDeltas(choice: ChatCompletionChunk.Choice): NormalizedToolCallDelta[] {
  const streamedToolCalls = choice.delta.tool_calls ?? []
  if (streamedToolCalls.length > 0) {
    return streamedToolCalls.map((toolCallDelta) => ({
      argumentsText: toolCallDelta.function?.arguments,
      id: toolCallDelta.id,
      index: toolCallDelta.index,
      name: toolCallDelta.function?.name,
    }))
  }

  const legacyFunctionCall = choice.delta.function_call
  if (!legacyFunctionCall) {
    return []
  }

  if (!hasNonBlankString(legacyFunctionCall.name) && !hasNonEmptyString(legacyFunctionCall.arguments)) {
    return []
  }

  return [
    {
      argumentsText: legacyFunctionCall.arguments,
      index: LEGACY_FUNCTION_CALL_INDEX,
      name: legacyFunctionCall.name,
    },
  ]
}

export function emitReadyToolCalls(
  toolCallsByIndex: Map<number, ToolCallAccumulator>,
  readyToolCallIndexes: Set<number>,
  currentIndex: number,
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void,
) {
  if (!onToolCallReady) {
    return
  }

  for (const [index, accumulator] of toolCallsByIndex.entries()) {
    if (index >= currentIndex || readyToolCallIndexes.has(index)) {
      continue
    }

    if (!isCompleteJsonObject(accumulator.argumentsText)) {
      continue
    }

    const toolCall = toToolCall(accumulator)
    if (!toolCall) {
      continue
    }

    readyToolCallIndexes.add(index)
    onToolCallReady(toolCall)
  }
}

export function collectToolCalls(
  chunk: ChatCompletionChunk,
  toolCallsByIndex: Map<number, ToolCallAccumulator>,
  emitDelta: ProviderStreamContext['emitDelta'],
  readyToolCallIndexes: Set<number>,
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void,
) {
  for (const choice of chunk.choices) {
    for (const toolCallDelta of toNormalizedToolCallDeltas(choice)) {
      const currentToolCall = toolCallsByIndex.get(toolCallDelta.index) ?? {
        argumentsText: '',
        id: toolCallDelta.id ?? randomUUID(),
        name: '',
        startedAt: null,
      }
      const previousArgumentsText = currentToolCall.argumentsText

      if (hasNonBlankString(toolCallDelta.id)) {
        currentToolCall.id = toolCallDelta.id
      }

      if (hasNonBlankString(toolCallDelta.name)) {
        currentToolCall.name = toolCallDelta.name
      }

      if (hasNonEmptyString(toolCallDelta.argumentsText)) {
        currentToolCall.argumentsText += toolCallDelta.argumentsText
      }

      if (currentToolCall.startedAt === null && currentToolCall.name.trim().length > 0) {
        currentToolCall.startedAt = Date.now()
        const startedEvent = {
          argumentsText: currentToolCall.argumentsText,
          invocationId: currentToolCall.id,
          startedAt: currentToolCall.startedAt,
          toolName: currentToolCall.name,
          type: 'tool_invocation_started',
        } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }>
        emitDelta(startedEvent)
      } else if (
        currentToolCall.startedAt !== null &&
        currentToolCall.argumentsText !== previousArgumentsText
      ) {
        const deltaEvent = {
          argumentsText: currentToolCall.argumentsText,
          invocationId: currentToolCall.id,
          toolName: currentToolCall.name,
          type: 'tool_invocation_delta',
        } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }>
        emitDelta(deltaEvent)
      }

      toolCallsByIndex.set(toolCallDelta.index, currentToolCall)
      emitReadyToolCalls(toolCallsByIndex, readyToolCallIndexes, toolCallDelta.index, onToolCallReady)
    }
  }
}

export function toToolCallList(toolCallsByIndex: Map<number, ToolCallAccumulator>) {
  return Array.from(toolCallsByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, toolCall]) => {
      const normalizedToolCall = toToolCall(toolCall)
      if (!normalizedToolCall) {
        throw new Error('OpenAI-compatible provider returned a tool call without a name.')
      }

      return normalizedToolCall
    })
}
