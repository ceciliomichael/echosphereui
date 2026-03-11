import OpenAI from 'openai'
import type { ResponseIncludable } from 'openai/resources/responses/responses'
import type { ApiKeyProviderId, Message, ReasoningEffort } from '../../../src/types/chat'
import { readStoredApiKeyProviders } from '../../providers/store'
import type { ChatProviderAdapter } from '../providerTypes'

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const OPENAI_COMPATIBLE_FALLBACK_API_KEY = 'echosphere-openai-compatible'
const OPENAI_MAX_RETRIES = 2
const OPENAI_REQUEST_TIMEOUT_MS = 120_000
const OPENAI_REASONING_INCLUDE_FIELDS: ResponseIncludable[] = ['reasoning.encrypted_content' as ResponseIncludable]
const OPENAI_SYSTEM_INSTRUCTIONS = 'You are EchoSphere, a helpful coding assistant.'

type OpenAIResponsesProviderId = Extract<ApiKeyProviderId, 'openai' | 'openai-compatible'>

interface OpenAIProviderConfig {
  apiKey: string
  baseURL: string
  stripAuthorizationHeader: boolean
}

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

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
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

function readDeltaText(input: unknown): string | null {
  if (typeof input === 'string' && input.length > 0) {
    return input
  }

  if (typeof input !== 'object' || input === null) {
    return null
  }

  const candidate = input as Record<string, unknown>
  if (typeof candidate.delta === 'string' && candidate.delta.length > 0) {
    return candidate.delta
  }

  if (typeof candidate.text === 'string' && candidate.text.length > 0) {
    return candidate.text
  }

  return null
}

function readNestedRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  return value as Record<string, unknown>
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

function handleStreamEventPayload(
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

function removeAuthorizationHeader(headersInput: HeadersInit | undefined) {
  const headers = new Headers(headersInput)
  headers.delete('Authorization')
  headers.delete('authorization')
  return headers
}

function buildOpenAIClient(providerConfig: OpenAIProviderConfig) {
  const baseClientOptions = {
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
    maxRetries: OPENAI_MAX_RETRIES,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  }

  if (!providerConfig.stripAuthorizationHeader) {
    return new OpenAI(baseClientOptions)
  }

  return new OpenAI({
    ...baseClientOptions,
    fetch: async (input, init) => {
      const nextInit: RequestInit = {
        ...init,
        headers: removeAuthorizationHeader(init?.headers),
      }

      return fetch(input, nextInit)
    },
  })
}

async function loadOpenAIProviderConfig(providerId: OpenAIResponsesProviderId): Promise<OpenAIProviderConfig> {
  const storedProviders = await readStoredApiKeyProviders()
  const providerConfig = storedProviders[providerId]
  const apiKey = providerConfig?.api_key?.trim() ?? ''
  const configuredBaseUrl = providerConfig?.base_url?.trim() ?? ''

  if (providerId === 'openai') {
    if (!apiKey) {
      throw new Error('OpenAI is not configured. Save an OpenAI API key in Settings > Providers before sending messages.')
    }

    return {
      apiKey,
      baseURL: configuredBaseUrl || OPENAI_DEFAULT_BASE_URL,
      stripAuthorizationHeader: false,
    }
  }

  if (!configuredBaseUrl) {
    throw new Error(
      'OpenAI Compatible is not configured. Save a base URL in Settings > Providers before sending messages.',
    )
  }

  return {
    apiKey: apiKey || OPENAI_COMPATIBLE_FALLBACK_API_KEY,
    baseURL: configuredBaseUrl,
    stripAuthorizationHeader: apiKey.length === 0,
  }
}

async function streamOpenAIResponse(
  client: OpenAI,
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

      handleStreamEventPayload(payload, (parsedEvent) => {
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

export const openaiCompatibleChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'openai-compatible',
  async streamResponse(request, context) {
    const providerConfig = await loadOpenAIProviderConfig('openai-compatible')
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
