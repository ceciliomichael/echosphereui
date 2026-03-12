import type { ProviderStreamContext } from '../providerTypes'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import { createCodexToolCallAccumulator } from './codexToolCallAccumulator'
import type { CodexStreamEventPayload, ParsedCodexStreamEvent } from './codexSsePayload'
import {
  extractReasoningTextFromContentPart,
  extractReasoningTextFromOutputItem,
  hasText,
  readDeltaText,
} from './codexSsePayload'

export interface CodexStreamTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

interface CreateCodexStreamAccumulatorOptions {
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void
}

function emitReasoningDelta(
  emitDelta: (event: ParsedCodexStreamEvent) => void,
  delta: string,
  sourceEventType: string,
  isNewReasoningBlock: boolean,
) {
  emitDelta({
    delta,
    isNewReasoningBlock,
    sourceEventType,
    type: 'reasoning_delta',
  })
}

export function createCodexStreamAccumulator(
  emitDelta: ProviderStreamContext['emitDelta'],
  options: CreateCodexStreamAccumulatorOptions = {},
) {
  let assistantContent = ''
  let hasReasoningContent = false
  let shouldPrefixNextReasoningSummaryDelta = false

  const toolCalls = createCodexToolCallAccumulator({
    emitDelta,
    onToolCallReady: options.onToolCallReady,
  })

  const emitParsedDelta = (event: ParsedCodexStreamEvent) => {
    if (event.type === 'content_delta') {
      assistantContent += event.delta
      emitDelta(event)
      return
    }

    if (event.type === 'reasoning_delta') {
      const shouldPrefixNewline =
        (Boolean(event.isNewReasoningBlock) ||
          (shouldPrefixNextReasoningSummaryDelta &&
            event.sourceEventType === 'response.reasoning_summary_text.delta')) &&
        hasReasoningContent &&
        event.delta.trim().length > 0 &&
        !event.delta.startsWith('\n')

      const normalizedDelta = shouldPrefixNewline ? `\n\n${event.delta}` : event.delta
      if (normalizedDelta.trim().length > 0) {
        hasReasoningContent = true
        shouldPrefixNextReasoningSummaryDelta = false
      }

      emitDelta({
        delta: normalizedDelta,
        type: 'reasoning_delta',
      })
      return
    }

    emitDelta(event)
  }

  return {
    consumePayload(payload: unknown) {
      if (typeof payload !== 'object' || payload === null) {
        return
      }

      const parsedPayload = payload as CodexStreamEventPayload
      const eventType = parsedPayload.type
      if (!hasText(eventType)) {
        return
      }

      if (eventType === 'response.reasoning_summary_text.done') {
        shouldPrefixNextReasoningSummaryDelta = true
        return
      }

      if (eventType === 'response.output_text.delta') {
        const delta = readDeltaText(parsedPayload.delta) ?? readDeltaText(parsedPayload.text)
        if (delta) {
          emitParsedDelta({
            delta,
            type: 'content_delta',
          })
        }
        return
      }

      if (eventType === 'response.reasoning_summary_text.delta' || eventType === 'response.reasoning_text.delta') {
        const delta = readDeltaText(parsedPayload.delta) ?? readDeltaText(parsedPayload.text)
        if (delta) {
          emitReasoningDelta(emitParsedDelta, delta, eventType, false)
        }
        return
      }

      if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
        const handledToolCall = toolCalls.handleOutputItem(parsedPayload)
        if (handledToolCall) {
          if (eventType === 'response.output_item.done') {
            toolCalls.markOutputItemCompleted(parsedPayload)
          }
          return
        }

        const delta = extractReasoningTextFromOutputItem(parsedPayload)
        if (delta) {
          emitReasoningDelta(emitParsedDelta, delta, eventType, eventType === 'response.output_item.added')
        }
        return
      }

      if (eventType === 'response.function_call_arguments.delta') {
        toolCalls.handleArgumentsDelta(parsedPayload)
        return
      }

      if (eventType === 'response.function_call_arguments.done') {
        toolCalls.finalizeArguments(parsedPayload)
        return
      }

      if (eventType === 'response.content_part.added' || eventType === 'response.content_part.delta') {
        const delta = extractReasoningTextFromContentPart(parsedPayload)
        if (delta) {
          emitReasoningDelta(emitParsedDelta, delta, eventType, eventType === 'response.content_part.added')
        }
        return
      }
    },
    buildResult(): CodexStreamTurnResult {
      return {
        assistantContent,
        toolCalls: toolCalls.buildToolCalls(),
      }
    },
  }
}
