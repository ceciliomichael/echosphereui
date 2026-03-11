import { randomUUID } from 'node:crypto'
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type { ChatMode, Message, ReasoningEffort } from '../../../src/types/chat'
import type { ProviderStreamContext } from '../providerTypes'
import { buildSystemPrompt } from '../prompts'
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
import { getOpenAICompatibleToolDefinition, getOpenAICompatibleToolDefinitions } from './toolRegistry'
import {
  buildFailedToolArtifacts,
  buildStartedToolInvocation,
  buildSuccessfulToolArtifacts,
} from './toolResultFormatter'
import { OpenAICompatibleToolError, type OpenAICompatibleToolCall } from './toolTypes'

interface StreamOpenAICompatibleResponseInput {
  agentContextRootPath: string
  chatMode: ChatMode
  messages: Message[]
  modelId: string
  reasoningEffort: ReasoningEffort
}

interface StreamOpenAICompatibleTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

interface ToolCallAccumulator {
  argumentsText: string
  id: string
  name: string
}

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

function buildOpenAICompatibleMessages(request: StreamOpenAICompatibleResponseInput): ChatCompletionMessageParam[] {
  return [
    {
      content: buildSystemPrompt({
        agentContextRootPath: request.agentContextRootPath,
        chatMode: request.chatMode,
        supportsNativeTools: true,
      }),
      role: 'system',
    },
    ...request.messages
      .map(toOpenAICompatibleMessage)
      .filter((value): value is ChatCompletionMessageParam => value !== null),
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

function collectToolCalls(
  chunk: ChatCompletionChunk,
  toolCallsByIndex: Map<number, ToolCallAccumulator>,
) {
  for (const choice of chunk.choices) {
    for (const toolCallDelta of choice.delta.tool_calls ?? []) {
      const currentToolCall = toolCallsByIndex.get(toolCallDelta.index) ?? {
        argumentsText: '',
        id: toolCallDelta.id ?? randomUUID(),
        name: '',
      }

      if (hasNonEmptyString(toolCallDelta.id)) {
        currentToolCall.id = toolCallDelta.id
      }

      if (hasNonEmptyString(toolCallDelta.function?.name)) {
        currentToolCall.name = toolCallDelta.function.name
      }

      if (hasNonEmptyString(toolCallDelta.function?.arguments)) {
        currentToolCall.argumentsText += toolCallDelta.function.arguments
      }

      toolCallsByIndex.set(toolCallDelta.index, currentToolCall)
    }
  }
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

function toToolCallList(toolCallsByIndex: Map<number, ToolCallAccumulator>) {
  return Array.from(toolCallsByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, toolCall]) => {
      if (!toolCall.name.trim()) {
        throw new Error('OpenAI-compatible provider returned a tool call without a name.')
      }

      return {
        argumentsText: toolCall.argumentsText,
        id: toolCall.id,
        name: toolCall.name,
      } satisfies OpenAICompatibleToolCall
    })
}

function buildOpenAICompatibleCompletionRequest(
  request: StreamOpenAICompatibleResponseInput,
  includeReasoningEffort: boolean,
): ChatCompletionCreateParamsStreaming {
  const payload: ChatCompletionCreateParamsStreaming = {
    messages: buildOpenAICompatibleMessages(request),
    model: request.modelId,
    parallel_tool_calls: true,
    store: false,
    stream: true,
    tools: getOpenAICompatibleToolDefinitions().map((toolDefinition) => toolDefinition.tool),
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

async function streamOpenAICompatibleTurn(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
): Promise<StreamOpenAICompatibleTurnResult> {
  const stream = await createOpenAICompatibleChatCompletionStream(client, request, context.signal)
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  let assistantContent = ''

  for await (const chunk of stream) {
    emitChunkDeltas(chunk, context.emitDelta)
    collectToolCalls(chunk, toolCallsByIndex)

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

function buildInMemoryAssistantMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Tool execution failed.'
}

async function executeToolCall(
  toolCall: OpenAICompatibleToolCall,
  context: ProviderStreamContext,
  request: StreamOpenAICompatibleResponseInput,
  inMemoryMessages: Message[],
) {
  const startedAt = Date.now()
  const startedToolInvocation = buildStartedToolInvocation(toolCall, startedAt)

  context.emitDelta({
    argumentsText: startedToolInvocation.argumentsText,
    invocationId: toolCall.id,
    startedAt,
    toolName: toolCall.name,
    type: 'tool_invocation_started',
  })

  const toolDefinition = getOpenAICompatibleToolDefinition(toolCall.name)
  if (!toolDefinition) {
    const completedAt = Date.now()
    const errorMessage = `Unsupported tool: ${toolCall.name}`
    const failedArtifacts = buildFailedToolArtifacts(toolCall, errorMessage, startedAt, completedAt)

    context.emitDelta({
      argumentsText: failedArtifacts.toolInvocation.argumentsText,
      completedAt,
      errorMessage,
      invocationId: toolCall.id,
      resultContent: failedArtifacts.resultContent,
      syntheticMessage: failedArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_failed',
    })

    inMemoryMessages.push(failedArtifacts.syntheticMessage)
    return
  }

  try {
    const argumentsValue = toolDefinition.parseArguments(toolCall.argumentsText)
    const semanticResult = await toolDefinition.execute(argumentsValue, {
      agentContextRootPath: request.agentContextRootPath,
      signal: context.signal,
    })
    const completedAt = Date.now()
    const successfulArtifacts = buildSuccessfulToolArtifacts(toolCall, semanticResult, startedAt, completedAt)

    context.emitDelta({
      argumentsText: successfulArtifacts.toolInvocation.argumentsText,
      completedAt,
      invocationId: toolCall.id,
      resultContent: successfulArtifacts.resultContent,
      syntheticMessage: successfulArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_completed',
    })

    inMemoryMessages.push(successfulArtifacts.syntheticMessage)
  } catch (error) {
    const completedAt = Date.now()
    const errorMessage = toErrorMessage(error)
    const errorDetails = error instanceof OpenAICompatibleToolError ? error.details : undefined
    const failedArtifacts = buildFailedToolArtifacts(toolCall, errorMessage, startedAt, completedAt, errorDetails)

    context.emitDelta({
      argumentsText: failedArtifacts.toolInvocation.argumentsText,
      completedAt,
      errorMessage,
      invocationId: toolCall.id,
      resultContent: failedArtifacts.resultContent,
      syntheticMessage: failedArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_failed',
    })

    inMemoryMessages.push(failedArtifacts.syntheticMessage)
  }
}

export async function streamOpenAICompatibleResponseWithTools(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
) {
  const inMemoryMessages = [...request.messages]

  while (!context.signal.aborted) {
    const turnResult = await streamOpenAICompatibleTurn(
      client,
      {
        agentContextRootPath: request.agentContextRootPath,
        chatMode: request.chatMode,
        messages: inMemoryMessages,
        modelId: request.modelId,
        reasoningEffort: request.reasoningEffort,
      },
      context,
    )

    if (turnResult.toolCalls.length === 0) {
      return
    }

    if (turnResult.assistantContent.trim().length > 0) {
      inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
    }

    for (const toolCall of turnResult.toolCalls) {
      await executeToolCall(toolCall, context, request, inMemoryMessages)

      if (context.signal.aborted) {
        return
      }
    }
  }
}
