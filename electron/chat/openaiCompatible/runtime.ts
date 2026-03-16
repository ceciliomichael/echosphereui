import { randomUUID } from 'node:crypto'
import type {
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'
import type { ChatMode, Message, ReasoningEffort } from '../../../src/types/chat'
import type { ProviderStreamContext } from '../providerTypes'
import { buildSystemPrompt } from '../prompts'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from '../providers/messageAttachments'
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
import { buildReplayableMessageHistory } from './messageHistory'
import { collectToolCalls, type ToolCallAccumulator, toToolCallList } from './toolCallStreaming'
import { shouldRecoverFromTextOnlyToolTurn } from './toolRecovery'
import { createHydratedToolExecutionTurnState, createToolExecutionScheduler, resolveWorkflowTurnToolChoice } from './toolExecution'
import { getOpenAICompatibleToolDefinitions } from './toolRegistry'
import type { OpenAICompatibleToolCall } from './toolTypes'
import { appendWorkflowPlanContextMessage } from './workflowPlanContext'
import { resolveForcedToolChoiceForTurn } from './workflowToolChoice'

interface StreamOpenAICompatibleResponseInput {
  agentContextRootPath: string
  chatMode: ChatMode
  forceToolChoice?: 'none' | 'required'
  messages: Message[]
  modelId: string
  reasoningEffort: ReasoningEffort
}

interface StreamOpenAICompatibleTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

interface StreamOpenAICompatibleTurnOptions {
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void
}

const MAX_INCOMPLETE_PLAN_NO_TOOL_RECOVERIES = 4
const REQUIRED_TOOL_CHOICE_RECOVERY_THRESHOLD = 3

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
    if (!hasText(message.content)) {
      return null
    }

    return {
      content: message.content,
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

async function buildOpenAICompatibleMessages(
  request: StreamOpenAICompatibleResponseInput,
): Promise<ChatCompletionMessageParam[]> {
  const systemPrompt = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    supportsNativeTools: true,
  })

  return [
    {
      content: systemPrompt,
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
  const payload: ChatCompletionCreateParamsStreaming = {
    messages: await buildOpenAICompatibleMessages(request),
    model: request.modelId,
    parallel_tool_calls: true,
    store: false,
    stream: true,
    tools: getOpenAICompatibleToolDefinitions().map((toolDefinition) => toolDefinition.tool),
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

async function streamOpenAICompatibleTurn(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
  options: StreamOpenAICompatibleTurnOptions = {},
): Promise<StreamOpenAICompatibleTurnResult> {
  const stream = await createOpenAICompatibleChatCompletionStream(client, request, context.signal)
  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  let assistantContent = ''

  for await (const chunk of stream) {
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

function buildInMemoryAssistantMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
  }
}

function buildInMemoryUserMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'user',
    timestamp: Date.now(),
  }
}

export async function streamOpenAICompatibleResponseWithTools(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
) {
  const inMemoryMessages = buildReplayableMessageHistory(request.messages)
  const turnState = createHydratedToolExecutionTurnState(request.messages, request.agentContextRootPath)
  const toolExecutionScheduler = createToolExecutionScheduler({
    agentContextRootPath: request.agentContextRootPath,
    context,
    inMemoryMessages,
    turnState,
  })
  let pseudoToolCallRecoveryAttempted = false
  let missingToolCallRecoveryCount = 0
  let enforceRequiredToolChoiceForNextTurn = false

  while (!context.signal.aborted) {
    const resolvedToolChoiceForTurn = resolveWorkflowTurnToolChoice(turnState)
    const forcedToolChoiceForTurn = resolveForcedToolChoiceForTurn(
      resolvedToolChoiceForTurn,
      enforceRequiredToolChoiceForNextTurn,
    )
    const replayableMessagesForTurn = appendWorkflowPlanContextMessage(
      buildReplayableMessageHistory(inMemoryMessages),
      turnState,
    )
    const scheduledToolCallIds = new Set<string>()
    const turnResult = await streamOpenAICompatibleTurn(
      client,
      {
        agentContextRootPath: request.agentContextRootPath,
        chatMode: request.chatMode,
        forceToolChoice: forcedToolChoiceForTurn,
        messages: replayableMessagesForTurn,
        modelId: request.modelId,
        reasoningEffort: request.reasoningEffort,
      },
      context,
      {
        onToolCallReady(toolCall) {
          scheduledToolCallIds.add(toolCall.id)
          toolExecutionScheduler.schedule(toolCall)
        },
      },
    )

    if (turnResult.toolCalls.length === 0) {
      const hasIncompleteWorkflowPlan = turnState.workflowPlan !== null && !turnState.workflowPlan.allStepsCompleted

      if (hasIncompleteWorkflowPlan && missingToolCallRecoveryCount < MAX_INCOMPLETE_PLAN_NO_TOOL_RECOVERIES) {
        missingToolCallRecoveryCount += 1
        enforceRequiredToolChoiceForNextTurn =
          missingToolCallRecoveryCount >= REQUIRED_TOOL_CHOICE_RECOVERY_THRESHOLD
        if (turnResult.assistantContent.trim().length > 0) {
          inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
        }
        inMemoryMessages.push(
          buildInMemoryUserMessage(
            'You have incomplete tasks. Continue your work on the current in_progress tasks. Use update_plan only when task statuses change.',
          ),
        )
        continue
      }

      if (
        !pseudoToolCallRecoveryAttempted &&
        shouldRecoverFromTextOnlyToolTurn(turnResult.assistantContent) &&
        turnResult.assistantContent.trim().length > 0
      ) {
        pseudoToolCallRecoveryAttempted = true
        inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
        inMemoryMessages.push(
          buildInMemoryUserMessage(
            'System notice: You output pseudo tool-call text. Do not describe tool calls in text. Invoke the appropriate tool directly.',
          ),
        )
        continue
      }

      return
    }
    missingToolCallRecoveryCount = 0
    enforceRequiredToolChoiceForNextTurn = false

    if (turnResult.assistantContent.trim().length > 0) {
      inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
    }

    for (const toolCall of turnResult.toolCalls) {
      if (scheduledToolCallIds.has(toolCall.id)) {
        continue
      }

      toolExecutionScheduler.schedule(toolCall)
    }

    await toolExecutionScheduler.drain()

    if (context.signal.aborted) {
      return
    }
  }
}
