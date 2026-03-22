import type {
  EasyInputMessage,
  ResponseCreateParamsStreaming,
  ResponseIncludable,
  ResponseInputImage,
  ResponseInputMessageContentList,
  ResponseInputText,
} from 'openai/resources/responses/responses'
import type { AppTerminalExecutionMode, ChatMode, ChatProviderId, Message, ReasoningEffort } from '../../../src/types/chat'
import { streamAgentLoopWithTools, type AgentLoopTurnOptions } from '../agentLoop/runtime'
import type { ProviderStreamContext } from '../providerTypes'
import { buildSystemPrompt } from '../prompts'
import { buildPromptCacheKey } from '../prompts/promptCache'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from '../providers/messageAttachments'
import { buildSerializedAssistantTurnContent } from './assistantToolInvocationContext'
import {
  buildOpenAIClient,
  hasText,
  isUnsupportedReasoningEffortError,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
} from '../providers/openaiShared'
import { createCodexStreamAccumulator } from '../providers/codexSseAccumulator'
import { getCodexToolDefinitions } from '../providers/codexPayload'
import {
  createOpenAICompatibleResponsesLoopState,
  type OpenAICompatibleResponsesRequestOverrides,
} from './responsesState'
import type { StreamOpenAICompatibleResponseInput, StreamOpenAICompatibleTurnResult } from './runtime'

const OPENAI_COMPATIBLE_REASONING_INCLUDE_FIELDS: ResponseIncludable[] = ['reasoning.encrypted_content' as ResponseIncludable]

interface StreamOpenAICompatibleResponsesDetailedTurnResult extends StreamOpenAICompatibleTurnResult {
  responseId: string
}

interface StreamOpenAICompatibleResponsesWithToolsInput {
  agentContextRootPath: string
  chatMode: ChatMode
  messages: Message[]
  modelId: string
  providerId?: ChatProviderId
  reasoningEffort: ReasoningEffort
  terminalExecutionMode?: AppTerminalExecutionMode
}

function buildOpenAICompatibleUserContent(message: Message): ResponseInputMessageContentList {
  const content: ResponseInputMessageContentList = []

  for (const textBlock of getUserMessageTextBlocks(message)) {
    content.push({
      text: textBlock,
      type: 'input_text',
    } satisfies ResponseInputText)
  }

  for (const attachment of getUserMessageImageAttachments(message)) {
    content.push({
      detail: 'auto',
      image_url: attachment.dataUrl,
      type: 'input_image',
    } satisfies ResponseInputImage)
  }

  return content
}

function toOpenAICompatibleInputMessage(message: Message): EasyInputMessage | null {
  if (message.role === 'tool') {
    return null
  }

  if (message.role === 'user') {
    const content = buildOpenAICompatibleUserContent(message)
    if (content.length === 0) {
      return null
    }

    return {
      content,
      role: 'user',
      type: 'message',
    }
  }

  const content = buildSerializedAssistantTurnContent(message)
  if (!hasText(content)) {
    return null
  }

  return {
    content,
    role: 'assistant',
    type: 'message',
  }
}

function buildOpenAICompatibleInput(messages: Message[]) {
  return messages
    .map(toOpenAICompatibleInputMessage)
    .filter((value): value is EasyInputMessage => value !== null)
}

function toResponsesToolChoice(forceToolChoice: 'none' | 'required' | undefined) {
  if (!forceToolChoice) {
    return 'auto'
  }

  return forceToolChoice
}

function buildResponsesTools(chatMode: StreamOpenAICompatibleResponseInput['chatMode']) {
  return getCodexToolDefinitions(chatMode).map((toolDefinition) => ({
    ...toolDefinition,
    strict: false,
  }))
}

async function buildOpenAICompatibleResponsesStreamRequest(
  request: StreamOpenAICompatibleResponseInput,
  overrides: OpenAICompatibleResponsesRequestOverrides = {},
): Promise<ResponseCreateParamsStreaming> {
  const instructions = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    providerId: request.providerId,
    supportsNativeTools: true,
    terminalExecutionMode: request.terminalExecutionMode,
  })
  const tools = buildResponsesTools(request.chatMode)

  return {
    include: OPENAI_COMPATIBLE_REASONING_INCLUDE_FIELDS,
    input: overrides.input ?? buildOpenAICompatibleInput(request.messages),
    instructions,
    model: request.modelId,
    prompt_cache_key: buildPromptCacheKey({
      chatMode: request.chatMode,
      forceToolChoice: request.forceToolChoice,
      kind: 'responses',
      modelId: request.modelId,
      providerId: request.providerId,
      systemPrompt: instructions,
      terminalExecutionMode: request.terminalExecutionMode,
      toolDefinitions: tools,
    }),
    prompt_cache_retention: 'in-memory',
    parallel_tool_calls: true,
    reasoning: {
      effort: request.reasoningEffort,
      summary: 'auto',
    },
    stream: true,
    tool_choice: toResponsesToolChoice(request.forceToolChoice),
    tools,
    truncation: 'auto',
    ...(overrides.previousResponseId ? { previous_response_id: overrides.previousResponseId } : {}),
  }
}

async function createOpenAICompatibleResponsesStream(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  signal: AbortSignal,
  overrides: OpenAICompatibleResponsesRequestOverrides = {},
) {
  const requestOptions = {
    maxRetries: OPENAI_MAX_RETRIES,
    signal,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  }

  try {
    return await client.responses.stream(await buildOpenAICompatibleResponsesStreamRequest(request, overrides), requestOptions)
  } catch (error) {
    if (!isUnsupportedReasoningEffortError(error)) {
      throw error
    }

    const payload = await buildOpenAICompatibleResponsesStreamRequest(request, overrides)
    delete payload.reasoning
    return client.responses.stream(payload, requestOptions)
  }
}

async function streamOpenAICompatibleResponsesTurnDetailed(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
  options: AgentLoopTurnOptions = {},
  overrides: OpenAICompatibleResponsesRequestOverrides = {},
): Promise<StreamOpenAICompatibleResponsesDetailedTurnResult> {
  const stream = await createOpenAICompatibleResponsesStream(client, request, context.signal, overrides)
  const accumulator = createCodexStreamAccumulator(context.emitDelta, {
    onToolCallReady: options.onToolCallReady,
  })
  const abortHandler = () => {
    stream.abort()
  }
  context.signal.addEventListener('abort', abortHandler, { once: true })

  try {
    for await (const event of stream) {
      accumulator.consumePayload(event)
    }

    const finalResponse = await stream.finalResponse()
    return {
      ...accumulator.buildResult(),
      responseId: finalResponse.id,
    }
  } finally {
    context.signal.removeEventListener('abort', abortHandler)
  }
}

export async function streamOpenAICompatibleResponsesTurn(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
  options: AgentLoopTurnOptions = {},
): Promise<StreamOpenAICompatibleTurnResult> {
  const turnResult = await streamOpenAICompatibleResponsesTurnDetailed(client, request, context, options)
  return {
    assistantContent: turnResult.assistantContent,
    toolCalls: turnResult.toolCalls,
  }
}

export async function streamOpenAICompatibleResponsesWithTools(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponsesWithToolsInput,
  context: ProviderStreamContext,
) {
  const loopState = createOpenAICompatibleResponsesLoopState()

  const contextWithToolOutputCapture: ProviderStreamContext = {
    ...context,
    emitDelta(event) {
      loopState.recordStreamEvent(event)
      context.emitDelta(event)
    },
  }

  await streamAgentLoopWithTools(
    {
      agentContextRootPath: request.agentContextRootPath,
      chatMode: request.chatMode,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId ?? 'openai-compatible',
      reasoningEffort: request.reasoningEffort,
      terminalExecutionMode: request.terminalExecutionMode ?? context.terminalExecutionMode,
    },
    contextWithToolOutputCapture,
    async (turnRequest, turnContext, options) => {
      const requestOverrides = loopState.buildRequestOverrides()
      const isFollowUpTurn = requestOverrides.previousResponseId !== undefined

      if (isFollowUpTurn && (!requestOverrides.input || requestOverrides.input.length === 0)) {
        throw new Error('Responses follow-up turn is missing function_call_output items.')
      }

      const turnResult = await streamOpenAICompatibleResponsesTurnDetailed(
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
        requestOverrides,
      )

      loopState.setPreviousResponseId(turnResult.responseId)
      return {
        assistantContent: turnResult.assistantContent,
        toolCalls: turnResult.toolCalls,
      }
    },
  )
}
