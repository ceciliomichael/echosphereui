import type {
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type { AppTerminalExecutionMode, ChatMode, ChatProviderId, Message, ReasoningEffort } from '../../../src/types/chat'
import { streamAgentLoopWithTools, type AgentLoopTurnOptions } from '../agentLoop/runtime'
import type { ProviderStreamContext } from '../providerTypes'
import { buildSystemPrompt } from '../prompts'
import { buildPromptCacheKey } from '../prompts/promptCache'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from '../providers/messageAttachments'
import { buildSerializedAssistantTurnContent } from './assistantToolInvocationContext'
import {
  buildOpenAIClient,
  hasNonEmptyString,
  hasText,
  isUnsupportedReasoningEffortError,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
  readNestedRecord,
  readTextLikeValue,
} from '../providers/openaiShared'
import { collectToolCalls, type ToolCallAccumulator, toToolCallList } from './toolCallStreaming'
import { getOpenAICompatibleToolDefinitions } from './toolRegistry'
import type { OpenAICompatibleToolCall } from './toolTypes'

interface StreamOpenAICompatibleResponseInput {
  agentContextRootPath: string
  chatMode: ChatMode
  forceToolChoice?: 'none' | 'required'
  messages: Message[]
  modelId: string
  providerId?: ChatProviderId
  reasoningEffort: ReasoningEffort
  terminalExecutionMode?: AppTerminalExecutionMode
}

interface StreamOpenAICompatibleTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

function toToolChunkDebugPreview(value: unknown, limit = 800) {
  try {
    const serialized = JSON.stringify(value)
    if (serialized.length <= limit) {
      return serialized
    }

    return `${serialized.slice(0, limit)}…`
  } catch {
    return '[unserializable]'
  }
}

function toOpenAICompatibleMessage(message: Message): ChatCompletionMessageParam | null {
  if (message.role === 'user') {
    const contentParts: ChatCompletionContentPart[] = []

    for (const textBlock of getUserMessageTextBlocks(message)) {
      contentParts.push({
        text: textBlock,
        type: 'text',
      } satisfies ChatCompletionContentPartText)
    }

    for (const attachment of getUserMessageImageAttachments(message)) {
      contentParts.push({
        image_url: {
          url: attachment.dataUrl,
        },
        type: 'image_url',
      } satisfies ChatCompletionContentPartImage)
    }

    if (contentParts.length === 0) {
      return null
    }

    return {
      content: contentParts,
      role: 'user',
    }
  }

  if (message.role === 'assistant') {
    const content = buildSerializedAssistantTurnContent(message)
    if (!hasText(content)) {
      return null
    }

    return {
      content,
      role: 'assistant',
    }
  }

  if (!hasNonEmptyString(message.toolCallId)) {
    return null
  }

  return {
    content: message.content,
    role: 'tool',
    tool_call_id: message.toolCallId,
  }
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

function emitChunkDeltas(chunk: ChatCompletionChunk, emitDelta: ProviderStreamContext['emitDelta']) {
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

async function buildOpenAICompatibleCompletionRequest(
  request: StreamOpenAICompatibleResponseInput,
  includeReasoningEffort: boolean,
): Promise<ChatCompletionCreateParamsStreaming> {
  const systemPrompt = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    providerId: request.providerId,
    supportsNativeTools: true,
    terminalExecutionMode: request.terminalExecutionMode,
  })
  const toolDefinitions = getOpenAICompatibleToolDefinitions(request.chatMode).map((toolDefinition) => toolDefinition.tool)
  const payload: ChatCompletionCreateParamsStreaming = {
    messages: [
      {
        content: systemPrompt,
        role: 'system',
      },
      ...request.messages
        .map(toOpenAICompatibleMessage)
        .filter((value): value is ChatCompletionMessageParam => value !== null),
    ],
    model: request.modelId,
    prompt_cache_key: buildPromptCacheKey({
      chatMode: request.chatMode,
      forceToolChoice: request.forceToolChoice,
      kind: 'chat-completions',
      modelId: request.modelId,
      providerId: request.providerId,
      systemPrompt,
      terminalExecutionMode: request.terminalExecutionMode,
      toolDefinitions,
    }),
    prompt_cache_retention: 'in-memory',
    parallel_tool_calls: true,
    store: false,
    stream: true,
    tools: toolDefinitions,
    ...(request.forceToolChoice ? { tool_choice: request.forceToolChoice } : {}),
  }

  if (includeReasoningEffort) {
    payload.reasoning_effort = request.reasoningEffort
  }

  return payload
}

async function createOpenAICompatibleChatCompletionStream(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  signal: AbortSignal,
) {
  const requestOptions = {
    maxRetries: OPENAI_MAX_RETRIES,
    signal,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  }

  try {
    return await client.chat.completions.create(
      await buildOpenAICompatibleCompletionRequest(request, true),
      requestOptions,
    )
  } catch (error) {
    if (!isUnsupportedReasoningEffortError(error)) {
      throw error
    }

    return client.chat.completions.create(await buildOpenAICompatibleCompletionRequest(request, false), requestOptions)
  }
}

export async function streamOpenAICompatibleChatCompletionsTurn(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
  options: AgentLoopTurnOptions = {},
): Promise<StreamOpenAICompatibleTurnResult> {
  const stream = await createOpenAICompatibleChatCompletionStream(client, request, context.signal)
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  let assistantContent = ''

  for await (const chunk of stream) {
    for (const [choiceIndex, choice] of chunk.choices.entries()) {
      const hasToolSignals =
        choice.delta.tool_calls !== undefined ||
        readNestedRecord(choice.delta)?.tool_call !== undefined ||
        choice.delta.function_call !== undefined ||
        readNestedRecord(choice as unknown as Record<string, unknown>)?.message !== undefined ||
        choice.finish_reason === 'tool_calls'

      if (!hasToolSignals) {
        continue
      }

      console.log('[tool-chunk:openai-compatible:raw-choice]', {
        chunkId: chunk.id,
        choiceIndex,
        finishReason: choice.finish_reason ?? null,
        messageToolCallsPreview: toToolChunkDebugPreview(
          readNestedRecord(readNestedRecord(choice as unknown as Record<string, unknown>)?.message)?.tool_calls,
        ),
        rawFunctionCallPreview: toToolChunkDebugPreview(choice.delta.function_call),
        rawSingularToolCallPreview: toToolChunkDebugPreview(readNestedRecord(choice.delta)?.tool_call),
        rawToolCallsPreview: toToolChunkDebugPreview(choice.delta.tool_calls),
      })
    }

    emitChunkDeltas(chunk, context.emitDelta)
    collectToolCalls(
      chunk,
      toolCallsByIndex,
      context.emitDelta,
      readyToolCallIndexes,
      options.onToolCallReady,
    )

    for (const choice of chunk.choices) {
      if (hasNonEmptyString(choice.delta.content)) {
        assistantContent += choice.delta.content
      }
    }
  }

  return {
    assistantContent,
    toolCalls: toToolCallList(toolCallsByIndex),
  }
}

export async function streamOpenAICompatibleResponseWithTools(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
) {
  await streamAgentLoopWithTools(
    {
      agentContextRootPath: request.agentContextRootPath,
      chatMode: request.chatMode,
      messages: request.messages,
      modelId: request.modelId,
      providerId: 'openai-compatible',
      reasoningEffort: request.reasoningEffort,
      terminalExecutionMode: context.terminalExecutionMode,
    },
    context,
    (turnRequest, turnContext, options) =>
      streamOpenAICompatibleChatCompletionsTurn(
        client,
        {
          agentContextRootPath: turnRequest.agentContextRootPath,
          chatMode: turnRequest.chatMode,
          forceToolChoice: turnRequest.forceToolChoice,
          messages: turnRequest.messages,
          modelId: turnRequest.modelId,
          providerId: request.providerId,
          reasoningEffort: turnRequest.reasoningEffort,
          terminalExecutionMode: request.terminalExecutionMode,
        },
        turnContext,
        options,
      ),
  )
}

export type { StreamOpenAICompatibleResponseInput, StreamOpenAICompatibleTurnResult }
