import type {
  ImageBlockParam,
  MessageParam,
  MessageStreamEvent,
  TextBlockParam,
  ToolChoice,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/messages'
import type { Message, ReasoningEffort } from '../../../src/types/chat'
import { streamAgentLoopWithTools, type AgentLoopTurnOptions } from '../agentLoop/runtime'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import type { ChatProviderAdapter } from '../providerTypes'
import {
  getUserMessageImageAttachments,
  getUserMessageTextBlocks,
  parseInlineImageData,
} from './messageAttachments'
import { buildAnthropicToolDefinitions, parseToolArgumentsTextToObject } from './providerNativeTools'
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

type AnthropicImageMimeType = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'

const ANTHROPIC_SUPPORTED_IMAGE_MIME_TYPES = new Set<AnthropicImageMimeType>([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function isAnthropicImageMimeType(value: string): value is AnthropicImageMimeType {
  return ANTHROPIC_SUPPORTED_IMAGE_MIME_TYPES.has(value as AnthropicImageMimeType)
}

function toAnthropicNonToolMessage(message: Message): MessageParam | null {
  if (message.role === 'assistant') {
    const content = message.content.trim()
    if (content.length === 0) {
      return null
    }

    return {
      content,
      role: 'assistant',
    }
  }

  const contentBlocks: Array<TextBlockParam | ImageBlockParam> = getUserMessageTextBlocks(message).map((textBlock) => ({
    text: textBlock,
    type: 'text',
  }))

  for (const attachment of getUserMessageImageAttachments(message)) {
    const inlineImage = parseInlineImageData(attachment)
    if (!inlineImage || !isAnthropicImageMimeType(inlineImage.mimeType)) {
      contentBlocks.push({
        text: `[Attached image: ${attachment.fileName}]`,
        type: 'text',
      })
      continue
    }

    contentBlocks.push({
      source: {
        data: inlineImage.base64Data,
        media_type: inlineImage.mimeType as AnthropicImageMimeType,
        type: 'base64',
      },
      type: 'image',
    })
  }

  if (contentBlocks.length === 0) {
    return null
  }

  return {
    content: contentBlocks,
    role: 'user',
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasOwnObjectProperties(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

function buildToolUseContent(toolCalls: OpenAICompatibleToolCall[]): ToolUseBlockParam[] {
  return toolCalls.map((toolCall) => ({
    id: toolCall.id,
    input: parseToolArgumentsTextToObject(toolCall.argumentsText),
    name: toolCall.name,
    type: 'tool_use',
  }))
}

function buildAnthropicMessages(messages: Message[], pendingToolCallsById: Map<string, OpenAICompatibleToolCall>) {
  const anthropicMessages: MessageParam[] = []
  const pendingToolMessages: Message[] = []

  const flushPendingToolMessages = () => {
    if (pendingToolMessages.length === 0) {
      return
    }

    const knownToolCalls: OpenAICompatibleToolCall[] = []
    const toolResultBlocks: ToolResultBlockParam[] = []
    const fallbackTextBlocks: TextBlockParam[] = []

    for (const toolMessage of pendingToolMessages) {
      const toolCallId = hasText(toolMessage.toolCallId) ? toolMessage.toolCallId : null
      const toolCall = toolCallId ? pendingToolCallsById.get(toolCallId) ?? null : null

      if (toolCall) {
        knownToolCalls.push(toolCall)
        toolResultBlocks.push({
          content: toolMessage.content,
          tool_use_id: toolCall.id,
          type: 'tool_result',
        })
        pendingToolCallsById.delete(toolCall.id)
        continue
      }

      if (hasText(toolMessage.content)) {
        fallbackTextBlocks.push({
          text: toolMessage.content,
          type: 'text',
        })
      }
    }

    if (knownToolCalls.length > 0) {
      anthropicMessages.push({
        content: buildToolUseContent(knownToolCalls),
        role: 'assistant',
      })
    }

    const userContent = [...toolResultBlocks, ...fallbackTextBlocks]
    if (userContent.length > 0) {
      anthropicMessages.push({
        content: userContent,
        role: 'user',
      })
    }

    pendingToolMessages.length = 0
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolMessages.push(message)
      continue
    }

    flushPendingToolMessages()
    const anthropicMessage = toAnthropicNonToolMessage(message)
    if (anthropicMessage) {
      anthropicMessages.push(anthropicMessage)
    }
  }

  flushPendingToolMessages()
  return anthropicMessages
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
    chatMode: 'agent' | 'plan'
    forceToolChoice?: 'none' | 'required'
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  pendingToolCallsById: Map<string, OpenAICompatibleToolCall>,
  emitDelta: (deltaEvent: {
    argumentsText?: string
    delta?: string
    invocationId?: string
    startedAt?: number
    toolName?: string
    type: 'content_delta' | 'reasoning_delta' | 'tool_invocation_delta' | 'tool_invocation_started'
  }) => void,
  signal: AbortSignal,
  options: AgentLoopTurnOptions = {},
) {
  const resolvedModelId = resolveAnthropicModelId(request.modelId)
  const supportsReasoningEffort = anthropicModelSupportsReasoningEffort(resolvedModelId)
  const inProgressToolCallsByIndex = new Map<number, OpenAICompatibleToolCall>()
  const finalizedToolCallsByIndex = new Map<number, OpenAICompatibleToolCall>()
  const toolArgumentsByIndex = new Map<number, string>()
  const stream = await client.messages.create(
    {
      max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
      messages: buildAnthropicMessages(request.messages, pendingToolCallsById),
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
      tool_choice: resolveAnthropicToolChoice(request.forceToolChoice),
      tools: buildAnthropicToolDefinitions(request.chatMode),
    },
    {
      maxRetries: ANTHROPIC_MAX_RETRIES,
      signal,
      timeout: ANTHROPIC_REQUEST_TIMEOUT_MS,
    },
  )

  for await (const event of stream) {
    handleAnthropicStreamEvent(event, (deltaEvent) => {
      emitDelta(deltaEvent)
    })

    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      const argumentsText = hasOwnObjectProperties(event.content_block.input)
        ? JSON.stringify(event.content_block.input)
        : ''
      const toolCall: OpenAICompatibleToolCall = {
        argumentsText,
        id: event.content_block.id,
        name: event.content_block.name,
        startedAt: Date.now(),
      }
      inProgressToolCallsByIndex.set(event.index, toolCall)
      toolArgumentsByIndex.set(event.index, argumentsText)
      emitDelta({
        argumentsText,
        invocationId: toolCall.id,
        startedAt: toolCall.startedAt,
        toolName: toolCall.name,
        type: 'tool_invocation_started',
      })
      continue
    }

    if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
      const toolCall = inProgressToolCallsByIndex.get(event.index)
      if (!toolCall) {
        continue
      }

      const previousArgumentsText = toolArgumentsByIndex.get(event.index) ?? ''
      const nextArgumentsText = previousArgumentsText + event.delta.partial_json
      toolArgumentsByIndex.set(event.index, nextArgumentsText)
      toolCall.argumentsText = nextArgumentsText
      emitDelta({
        argumentsText: nextArgumentsText,
        invocationId: toolCall.id,
        toolName: toolCall.name,
        type: 'tool_invocation_delta',
      })
      continue
    }

    if (event.type === 'content_block_stop') {
      const toolCall = inProgressToolCallsByIndex.get(event.index)
      if (!toolCall) {
        continue
      }

      const finalizedArgumentsText = (toolArgumentsByIndex.get(event.index) ?? toolCall.argumentsText) || '{}'
      const finalizedToolCall: OpenAICompatibleToolCall = {
        ...toolCall,
        argumentsText: finalizedArgumentsText,
      }
      finalizedToolCallsByIndex.set(event.index, finalizedToolCall)
      options.onToolCallReady?.(finalizedToolCall)
      inProgressToolCallsByIndex.delete(event.index)
      toolArgumentsByIndex.delete(event.index)
    }
  }

  for (const [toolIndex, toolCall] of inProgressToolCallsByIndex.entries()) {
    const finalizedToolCall: OpenAICompatibleToolCall = {
      ...toolCall,
      argumentsText: (toolArgumentsByIndex.get(toolIndex) ?? toolCall.argumentsText) || '{}',
    }
    finalizedToolCallsByIndex.set(toolIndex, finalizedToolCall)
  }

  return {
    assistantContent: '',
    toolCalls: Array.from(finalizedToolCallsByIndex.entries())
      .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
      .map(([, toolCall]) => toolCall),
  }
}

function resolveAnthropicToolChoice(forceToolChoice: 'none' | 'required' | undefined): ToolChoice | undefined {
  if (forceToolChoice === 'none') {
    return { type: 'none' }
  }

  if (forceToolChoice === 'required') {
    return { type: 'any' }
  }

  return undefined
}

export const anthropicChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'anthropic',
  async streamResponse(request, context) {
    const providerConfig = await loadAnthropicProviderConfig()
    const client = buildAnthropicClient(providerConfig)
    const pendingToolCallsById = new Map<string, OpenAICompatibleToolCall>()

    try {
      await streamAgentLoopWithTools(
        {
          agentContextRootPath: request.agentContextRootPath,
          chatMode: request.chatMode,
          messages: request.messages,
          modelId: request.modelId,
          providerId: 'anthropic',
          reasoningEffort: request.reasoningEffort,
          terminalExecutionMode: request.terminalExecutionMode,
        },
        context,
        async (turnRequest, turnContext, options) => {
          const assistantContentDeltas: string[] = []
          const turnResult = await streamAnthropicMessage(
            client,
            {
              chatMode: turnRequest.chatMode,
              forceToolChoice: turnRequest.forceToolChoice,
              messages: turnRequest.messages,
              modelId: turnRequest.modelId,
              reasoningEffort: turnRequest.reasoningEffort,
            },
            pendingToolCallsById,
            (event) => {
              if (event.type === 'content_delta' && event.delta) {
                assistantContentDeltas.push(event.delta)
                turnContext.emitDelta({
                  delta: event.delta,
                  type: 'content_delta',
                })
                return
              }

              if (event.type === 'reasoning_delta' && event.delta) {
                turnContext.emitDelta({
                  delta: event.delta,
                  type: 'reasoning_delta',
                })
                return
              }

              if (event.type === 'tool_invocation_started' && event.argumentsText && event.invocationId && event.toolName && event.startedAt) {
                turnContext.emitDelta({
                  argumentsText: event.argumentsText,
                  invocationId: event.invocationId,
                  startedAt: event.startedAt,
                  toolName: event.toolName,
                  type: 'tool_invocation_started',
                })
                return
              }

              if (event.type === 'tool_invocation_delta' && event.argumentsText && event.invocationId && event.toolName) {
                turnContext.emitDelta({
                  argumentsText: event.argumentsText,
                  invocationId: event.invocationId,
                  toolName: event.toolName,
                  type: 'tool_invocation_delta',
                })
              }
            },
            turnContext.signal,
            options,
          )
          pendingToolCallsById.clear()
          for (const toolCall of turnResult.toolCalls) {
            pendingToolCallsById.set(toolCall.id, toolCall)
          }

          return {
            assistantContent: assistantContentDeltas.join(''),
            toolCalls: turnResult.toolCalls,
          }
        },
      )
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      throw error
    }
  },
}
