import { randomUUID } from 'node:crypto'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import type { CodexStreamEventPayload, ToolLifecycleStreamEvent } from './codexSsePayload'
import {
  readDeltaText,
  readNestedRecord,
  readNonNegativeInteger,
  readText,
} from './codexSsePayload'

interface CodexToolCallAccumulator {
  argumentsText: string
  id: string
  itemId: string | null
  name: string
  outputIndex: number
  startedAt: number | null
}

interface CreateCodexToolCallAccumulatorOptions {
  emitDelta: (event: ToolLifecycleStreamEvent) => void
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void
}

function readCodexToolOutputIndex(payload: CodexStreamEventPayload, item: Record<string, unknown> | null) {
  return readNonNegativeInteger(payload.output_index) ?? readNonNegativeInteger(item?.output_index)
}

function registerToolAccumulatorReferences(
  referenceIndex: Map<string, number>,
  accumulator: CodexToolCallAccumulator,
) {
  referenceIndex.set(accumulator.id, accumulator.outputIndex)

  if (accumulator.itemId) {
    referenceIndex.set(accumulator.itemId, accumulator.outputIndex)
  }
}

function emitToolAccumulatorLifecycleEvent(
  accumulator: CodexToolCallAccumulator,
  previousArgumentsText: string,
  emitDelta: (event: ToolLifecycleStreamEvent) => void,
) {
  if (accumulator.startedAt === null && accumulator.name.trim().length > 0) {
    accumulator.startedAt = Date.now()
    emitDelta({
      argumentsText: accumulator.argumentsText,
      invocationId: accumulator.id,
      startedAt: accumulator.startedAt,
      toolName: accumulator.name,
      type: 'tool_invocation_started',
    })
    return
  }

  if (accumulator.startedAt !== null && accumulator.argumentsText !== previousArgumentsText) {
    emitDelta({
      argumentsText: accumulator.argumentsText,
      invocationId: accumulator.id,
      toolName: accumulator.name,
      type: 'tool_invocation_delta',
    })
  }
}

function toToolCall(toolCall: CodexToolCallAccumulator): OpenAICompatibleToolCall {
  if (!toolCall.name.trim()) {
    throw new Error('Codex returned a tool call without a name.')
  }

  return {
    argumentsText: toolCall.argumentsText,
    id: toolCall.id,
    name: toolCall.name,
    startedAt: toolCall.startedAt ?? Date.now(),
  }
}

export function createCodexToolCallAccumulator(options: CreateCodexToolCallAccumulatorOptions) {
  const toolCallsByOutputIndex = new Map<number, CodexToolCallAccumulator>()
  const completedToolCallOutputIndexes = new Set<number>()
  const referenceIndex = new Map<string, number>()
  let nextSyntheticOutputIndexValue = 0

  const nextSyntheticOutputIndex = () => {
    const nextValue = nextSyntheticOutputIndexValue
    nextSyntheticOutputIndexValue += 1
    return nextValue
  }

  const resolveOutputIndex = (payload: CodexStreamEventPayload, item: Record<string, unknown> | null) => {
    const directOutputIndex = readCodexToolOutputIndex(payload, item)
    if (directOutputIndex !== null) {
      return directOutputIndex
    }

    const referenceCandidates = [payload.call_id, payload.item_id, item?.call_id, item?.id]
    for (const candidate of referenceCandidates) {
      const reference = readText(candidate)
      if (!reference) {
        continue
      }

      const outputIndex = referenceIndex.get(reference)
      if (typeof outputIndex === 'number') {
        return outputIndex
      }
    }

    return nextSyntheticOutputIndex()
  }

  const emitCompletedToolCall = (outputIndex: number) => {
    if (!options.onToolCallReady || completedToolCallOutputIndexes.has(outputIndex)) {
      return
    }

    const toolAccumulator = toolCallsByOutputIndex.get(outputIndex)
    if (!toolAccumulator || !toolAccumulator.name.trim()) {
      return
    }

    completedToolCallOutputIndexes.add(outputIndex)
    options.onToolCallReady(toToolCall(toolAccumulator))
  }

  const upsertAccumulator = (
    outputIndex: number,
    buildDefaultAccumulator: () => CodexToolCallAccumulator,
    updateAccumulator: (accumulator: CodexToolCallAccumulator) => void,
  ) => {
    const accumulator = toolCallsByOutputIndex.get(outputIndex) ?? buildDefaultAccumulator()
    const previousArgumentsText = accumulator.argumentsText

    updateAccumulator(accumulator)

    toolCallsByOutputIndex.set(outputIndex, accumulator)
    registerToolAccumulatorReferences(referenceIndex, accumulator)
    emitToolAccumulatorLifecycleEvent(accumulator, previousArgumentsText, options.emitDelta)
  }

  return {
    handleOutputItem(payload: CodexStreamEventPayload) {
      const item = readNestedRecord(payload.item)
      if (!item || item.type !== 'function_call') {
        return false
      }

      const outputIndex = resolveOutputIndex(payload, item)
      upsertAccumulator(
        outputIndex,
        () => ({
          argumentsText: '',
          id: readText(item.call_id) ?? readText(payload.call_id) ?? randomUUID(),
          itemId: readText(item.id) ?? readText(payload.item_id),
          name: '',
          outputIndex,
          startedAt: null,
        }),
        (accumulator) => {
          const nextToolId = readText(item.call_id) ?? readText(payload.call_id)
          if (nextToolId) {
            accumulator.id = nextToolId
          }

          const nextItemId = readText(item.id) ?? readText(payload.item_id)
          if (nextItemId) {
            accumulator.itemId = nextItemId
          }

          const nextName = readText(item.name)
          if (nextName) {
            accumulator.name = nextName
          }

          const nextArgumentsText =
            readText(item.arguments) ?? readDeltaText(item.arguments) ?? readText(payload.arguments)
          if (nextArgumentsText !== null) {
            accumulator.argumentsText = nextArgumentsText
          }
        },
      )

      return true
    },
    handleArgumentsDelta(payload: CodexStreamEventPayload) {
      const item = readNestedRecord(payload.item)
      const delta = readDeltaText(payload.delta)
      if (!delta) {
        return
      }

      const outputIndex = resolveOutputIndex(payload, item)
      upsertAccumulator(
        outputIndex,
        () => ({
          argumentsText: '',
          id: readText(payload.call_id) ?? readText(item?.call_id) ?? randomUUID(),
          itemId: readText(payload.item_id) ?? readText(item?.id),
          name: readText(item?.name) ?? '',
          outputIndex,
          startedAt: null,
        }),
        (accumulator) => {
          accumulator.argumentsText += delta

          const nextToolId = readText(payload.call_id) ?? readText(item?.call_id)
          if (nextToolId) {
            accumulator.id = nextToolId
          }

          const nextItemId = readText(payload.item_id) ?? readText(item?.id)
          if (nextItemId) {
            accumulator.itemId = nextItemId
          }

          const nextName = readText(item?.name)
          if (nextName) {
            accumulator.name = nextName
          }
        },
      )
    },
    finalizeArguments(payload: CodexStreamEventPayload) {
      const item = readNestedRecord(payload.item)
      const outputIndex = resolveOutputIndex(payload, item)
      const accumulator = toolCallsByOutputIndex.get(outputIndex)
      if (!accumulator) {
        return
      }

      const previousArgumentsText = accumulator.argumentsText
      const nextArgumentsText = readText(payload.arguments) ?? readText(item?.arguments) ?? readDeltaText(item?.arguments)
      if (nextArgumentsText !== null) {
        accumulator.argumentsText = nextArgumentsText
      }

      const nextToolId = readText(payload.call_id) ?? readText(item?.call_id)
      if (nextToolId) {
        accumulator.id = nextToolId
      }

      const nextItemId = readText(payload.item_id) ?? readText(item?.id)
      if (nextItemId) {
        accumulator.itemId = nextItemId
      }

      const nextName = readText(item?.name)
      if (nextName) {
        accumulator.name = nextName
      }

      registerToolAccumulatorReferences(referenceIndex, accumulator)
      emitToolAccumulatorLifecycleEvent(accumulator, previousArgumentsText, options.emitDelta)
      emitCompletedToolCall(outputIndex)
    },
    markOutputItemCompleted(payload: CodexStreamEventPayload) {
      const item = readNestedRecord(payload.item)
      emitCompletedToolCall(resolveOutputIndex(payload, item))
    },
    buildToolCalls() {
      return Array.from(toolCallsByOutputIndex.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([, toolCall]) => toToolCall(toolCall))
    },
  }
}
