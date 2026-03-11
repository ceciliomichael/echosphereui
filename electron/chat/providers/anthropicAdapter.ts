import type { MessageParam, MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages'
import type { Message, ReasoningEffort } from '../../../src/types/chat'
import type { ChatProviderAdapter } from '../providerTypes'
import {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_MAX_RETRIES,
  ANTHROPIC_REQUEST_TIMEOUT_MS,
  ANTHROPIC_SYSTEM_INSTRUCTIONS,
  anthropicModelSupportsReasoningEffort,
  buildAnthropicClient,
  loadAnthropicProviderConfig,
  resolveAnthropicModelId,
  toAnthropicReasoningEffort,
} from './anthropicShared'

function toAnthropicMessage(message: Message): MessageParam | null {
  const content = message.content.trim()
  if (content.length === 0) {
    return null
  }

  return {
    content,
    role: message.role,
  }
}

function buildAnthropicMessages(messages: Message[]) {
  return messages.map(toAnthropicMessage).filter((value): value is MessageParam => value !== null)
}

function handleAnthropicStreamEvent(
  event: MessageStreamEvent,
  emitDelta: (deltaEvent: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
) {
  if (event.type === 'content_block_start') {
    if (event.content_block.type === 'text' && event.content_block.text.length > 0) {
      emitDelta({
        delta: event.content_block.text,
        type: 'content_delta',
      })
      return
    }

    if (event.content_block.type === 'thinking' && event.content_block.thinking.length > 0) {
      emitDelta({
        delta: event.content_block.thinking,
        type: 'reasoning_delta',
      })
    }
    return
  }

  if (event.type !== 'content_block_delta') {
    return
  }

  if (event.delta.type === 'text_delta' && event.delta.text.length > 0) {
    emitDelta({
      delta: event.delta.text,
      type: 'content_delta',
    })
    return
  }

  if (event.delta.type === 'thinking_delta' && event.delta.thinking.length > 0) {
    emitDelta({
      delta: event.delta.thinking,
      type: 'reasoning_delta',
    })
  }
}

async function streamAnthropicMessage(
  client: ReturnType<typeof buildAnthropicClient>,
  request: {
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  emitDelta: (deltaEvent: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
  signal: AbortSignal,
) {
  const resolvedModelId = resolveAnthropicModelId(request.modelId)
  const supportsReasoningEffort = anthropicModelSupportsReasoningEffort(resolvedModelId)
  const stream = await client.messages.create(
    {
      max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
      messages: buildAnthropicMessages(request.messages),
      model: resolvedModelId,
      ...(supportsReasoningEffort
        ? {
            output_config: {
              effort: toAnthropicReasoningEffort(request.reasoningEffort),
            },
            thinking: {
              type: 'adaptive' as const,
            },
          }
        : {}),
      stream: true,
      system: ANTHROPIC_SYSTEM_INSTRUCTIONS,
    },
    {
      maxRetries: ANTHROPIC_MAX_RETRIES,
      signal,
      timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
    },
  )

  for await (const event of stream) {
    handleAnthropicStreamEvent(event, emitDelta)
  }
}

export const anthropicChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'anthropic',
  async streamResponse(request, context) {
    const providerConfig = await loadAnthropicProviderConfig()
    const client = buildAnthropicClient(providerConfig)

    try {
      await streamAnthropicMessage(
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
