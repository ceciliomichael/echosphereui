import type { ResponseIncludable } from 'openai/resources/responses/responses'
import type { Message, ReasoningEffort } from '../../../src/types/chat'
import type { ChatProviderAdapter } from '../providerTypes'
import {
  buildOpenAIClient,
  hasText,
  loadOpenAIProviderConfig,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_SYSTEM_INSTRUCTIONS,
  readDeltaText,
  readNestedRecord,
} from './openaiShared'

const OPENAI_REASONING_INCLUDE_FIELDS: ResponseIncludable[] = ['reasoning.encrypted_content' as ResponseIncludable]

interface OpenAIInputMessage {
  content: string
  role: 'assistant' | 'user'
  type: 'message'
}

interface OpenAIStreamEventPayload {
  [key: string]: unknown
  delta?: unknown
  item?: unknown
  part?: unknown
  text?: unknown
  type?: unknown
}

function toOpenAIInputMessage(message: Message): OpenAIInputMessage | null {
  if (!hasText(message.content)) {
    return null
  }

  if (message.role === 'user') {
    return {
      content: message.content,
      role: 'user',
      type: 'message',
    }
  }

  return {
    content: message.content,
    role: 'assistant',
    type: 'message',
  }
}

function buildOpenAIInput(messages: Message[]) {
  return messages.map(toOpenAIInputMessage).filter((value): value is OpenAIInputMessage => value !== null)
}

function extractReasoningTextFromOutputItem(payload: OpenAIStreamEventPayload): string | null {
  const item = readNestedRecord(payload.item)
  if (!item) {
    return null
  }

  const itemType = item.type
  if (typeof itemType !== 'string' || (!itemType.includes('reasoning') && !itemType.includes('summary'))) {
    return null
  }

  const directText = readDeltaText(item.text) ?? readDeltaText(item.delta)
  if (directText) {
    return directText
  }

  const summary = item.summary
  if (!Array.isArray(summary)) {
    return null
  }

  const summaryText = summary
    .map((entry) => {
      const summaryEntry = readNestedRecord(entry)
      if (!summaryEntry) {
        return null
      }

      return readDeltaText(summaryEntry.text) ?? readDeltaText(summaryEntry.delta)
    })
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('')

  return summaryText.length > 0 ? summaryText : null
}

function extractReasoningTextFromContentPart(payload: OpenAIStreamEventPayload): string | null {
  const part = readNestedRecord(payload.part)
  const partType = part?.type
  if (typeof partType !== 'string' || (!partType.includes('reasoning') && !partType.includes('summary'))) {
    return null
  }

  return readDeltaText(payload.delta) ?? readDeltaText(part?.text) ?? readDeltaText(part?.delta)
}

function handleResponsesStreamEventPayload(
  payload: OpenAIStreamEventPayload,
  emitDelta: (event: {
    delta: string
    isNewReasoningBlock?: boolean
    sourceEventType?: string
    type: 'content_delta' | 'reasoning_delta'
  }) => void,
) {
  const eventType = payload.type
  if (!hasText(eventType)) {
    return
  }

  if (eventType === 'response.output_text.delta') {
    const delta = readDeltaText(payload.delta) ?? readDeltaText(payload.text)
    if (!delta) {
      return
    }

    emitDelta({
      delta,
      type: 'content_delta',
    })
    return
  }

  if (eventType === 'response.reasoning_summary_text.delta' || eventType === 'response.reasoning_text.delta') {
    const delta = readDeltaText(payload.delta) ?? readDeltaText(payload.text)
    if (!delta) {
      return
    }

    emitDelta({
      delta,
      isNewReasoningBlock: false,
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
    return
  }

  if (eventType === 'response.output_item.added') {
    const outputItemReasoningText = extractReasoningTextFromOutputItem(payload)
    if (!outputItemReasoningText) {
      return
    }

    emitDelta({
      delta: outputItemReasoningText,
      isNewReasoningBlock: true,
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
    return
  }

  if (eventType === 'response.content_part.added' || eventType === 'response.content_part.delta') {
    const contentPartReasoningText = extractReasoningTextFromContentPart(payload)
    if (!contentPartReasoningText) {
      return
    }

    emitDelta({
      delta: contentPartReasoningText,
      isNewReasoningBlock: eventType === 'response.content_part.added',
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
  }
}

async function streamOpenAIResponse(
  client: ReturnType<typeof buildOpenAIClient>,
  request: {
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  emitDelta: (event: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
  signal: AbortSignal,
) {
  const stream = client.responses.stream(
    {
      include: OPENAI_REASONING_INCLUDE_FIELDS,
      input: buildOpenAIInput(request.messages),
      instructions: OPENAI_SYSTEM_INSTRUCTIONS,
      model: request.modelId,
      reasoning: {
        effort: request.reasoningEffort,
        summary: 'auto',
      },
      store: false,
      truncation: 'auto',
    },
    {
      maxRetries: OPENAI_MAX_RETRIES,
      signal,
      timeout: OPENAI_REQUEST_TIMEOUT_MS,
    },
  )

  const abortHandler = () => {
    stream.abort()
  }
  signal.addEventListener('abort', abortHandler, { once: true })

  let hasReasoningContent = false
  let shouldPrefixNextReasoningSummaryDelta = false

  try {
    for await (const event of stream) {
      const payload = event as unknown as OpenAIStreamEventPayload
      const payloadType = typeof payload.type === 'string' ? payload.type : ''
      if (payloadType === 'response.reasoning_summary_text.done') {
        shouldPrefixNextReasoningSummaryDelta = true
      }

      handleResponsesStreamEventPayload(payload, (parsedEvent) => {
        if (parsedEvent.type !== 'reasoning_delta') {
          emitDelta(parsedEvent)
          return
        }

        const shouldPrefixNewline =
          (Boolean(parsedEvent.isNewReasoningBlock) ||
            (shouldPrefixNextReasoningSummaryDelta &&
              parsedEvent.sourceEventType === 'response.reasoning_summary_text.delta')) &&
          hasReasoningContent &&
          parsedEvent.delta.trim().length > 0 &&
          !parsedEvent.delta.startsWith('\n')

        const normalizedDelta = shouldPrefixNewline ? `\n\n${parsedEvent.delta}` : parsedEvent.delta
        if (normalizedDelta.trim().length > 0) {
          hasReasoningContent = true
          shouldPrefixNextReasoningSummaryDelta = false
        }

        emitDelta({
          delta: normalizedDelta,
          type: 'reasoning_delta',
        })
      })
    }
  } finally {
    signal.removeEventListener('abort', abortHandler)
  }
}

export const openaiChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'openai',
  async streamResponse(request, context) {
    const providerConfig = await loadOpenAIProviderConfig('openai')
    const client = buildOpenAIClient(providerConfig)

    try {
      await streamOpenAIResponse(
        client,
        {
          messages: request.messages,
          modelId: request.modelId,
          reasoningEffort: request.reasoningEffort,
        },
        context.emitDelta,
        context.signal,
      )
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      throw error
    }
  },
}
