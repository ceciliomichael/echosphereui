import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type { Message, ReasoningEffort } from '../../../src/types/chat'
import type { ChatProviderAdapter } from '../providerTypes'
import {
  buildOpenAIClient,
  hasNonEmptyString,
  hasText,
  isUnsupportedReasoningEffortError,
  loadOpenAIProviderConfig,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_SYSTEM_INSTRUCTIONS,
  readNestedRecord,
  readTextLikeValue,
} from './openaiShared'

function toOpenAICompatibleMessage(message: Message): ChatCompletionMessageParam | null {
  if (!hasText(message.content)) {
    return null
  }

  if (message.role === 'user') {
    return {
      content: message.content,
      role: 'user',
    }
  }

  return {
    content: message.content,
    role: 'assistant',
  }
}

function buildOpenAICompatibleMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return [
    {
      content: OPENAI_SYSTEM_INSTRUCTIONS,
      role: 'system',
    },
    ...messages.map(toOpenAICompatibleMessage).filter((value): value is ChatCompletionMessageParam => value !== null),
  ]
}

function extractOpenAICompatibleReasoningDelta(delta: unknown): string | null {
  const deltaRecord = readNestedRecord(delta)
  if (!deltaRecord) {
    return null
  }

  return (
    readTextLikeValue(deltaRecord.reasoning_content) ??
    readTextLikeValue(deltaRecord.reasoning) ??
    readTextLikeValue(deltaRecord.reasoning_text) ??
    readTextLikeValue(deltaRecord.thinking)
  )
}

function handleChatCompletionChunk(
  chunk: ChatCompletionChunk,
  emitDelta: (event: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
) {
  for (const choice of chunk.choices) {
    if (hasNonEmptyString(choice.delta.content)) {
      emitDelta({
        delta: choice.delta.content,
        type: 'content_delta',
      })
    }

    const reasoningDelta = extractOpenAICompatibleReasoningDelta(choice.delta)
    if (reasoningDelta) {
      emitDelta({
        delta: reasoningDelta,
        type: 'reasoning_delta',
      })
    }
  }
}

function buildOpenAICompatibleCompletionRequest(
  request: {
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  includeReasoningEffort: boolean,
): ChatCompletionCreateParamsStreaming {
  const payload: ChatCompletionCreateParamsStreaming = {
    messages: buildOpenAICompatibleMessages(request.messages),
    model: request.modelId,
    store: false,
    stream: true,
  }

  if (includeReasoningEffort) {
    payload.reasoning_effort = request.reasoningEffort
  }

  return payload
}

async function createOpenAICompatibleChatCompletionStream(
  client: ReturnType<typeof buildOpenAIClient>,
  request: {
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  signal: AbortSignal,
) {
  const requestOptions = {
    maxRetries: OPENAI_MAX_RETRIES,
    signal,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  }

  try {
    return await client.chat.completions.create(
      buildOpenAICompatibleCompletionRequest(request, true),
      requestOptions,
    )
  } catch (error) {
    if (!isUnsupportedReasoningEffortError(error)) {
      throw error
    }

    return client.chat.completions.create(buildOpenAICompatibleCompletionRequest(request, false), requestOptions)
  }
}

async function streamOpenAICompatibleChatCompletion(
  client: ReturnType<typeof buildOpenAIClient>,
  request: {
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  emitDelta: (event: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
  signal: AbortSignal,
) {
  const stream = await createOpenAICompatibleChatCompletionStream(client, request, signal)

  for await (const chunk of stream) {
    handleChatCompletionChunk(chunk, emitDelta)
  }
}

export const openaiCompatibleChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'openai-compatible',
  async streamResponse(request, context) {
    const providerConfig = await loadOpenAIProviderConfig('openai-compatible')
    const client = buildOpenAIClient(providerConfig)

    try {
      await streamOpenAICompatibleChatCompletion(
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
