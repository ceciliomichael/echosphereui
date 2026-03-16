import type {
  EasyInputMessage,
  ResponseCreateParamsStreaming,
  ResponseIncludable,
  ResponseInputImage,
  ResponseInputMessageContentList,
  ResponseInputText,
} from 'openai/resources/responses/responses'
import type { Message } from '../../../src/types/chat'
import type { AgentLoopTurnOptions } from '../agentLoop/runtime'
import type { ProviderStreamContext } from '../providerTypes'
import { buildSystemPrompt } from '../prompts'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from '../providers/messageAttachments'
import {
  buildOpenAIClient,
  hasText,
  isUnsupportedReasoningEffortError,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
} from '../providers/openaiShared'
import { createCodexStreamAccumulator } from '../providers/codexSseAccumulator'
import { getCodexToolDefinitions } from '../providers/codexPayload'
import type { StreamOpenAICompatibleResponseInput, StreamOpenAICompatibleTurnResult } from './runtime'

const OPENAI_COMPATIBLE_REASONING_INCLUDE_FIELDS: ResponseIncludable[] = ['reasoning.encrypted_content' as ResponseIncludable]

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

  if (!hasText(message.content)) {
    return null
  }

  return {
    content: message.content,
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
): Promise<ResponseCreateParamsStreaming> {
  const instructions = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    providerId: request.providerId,
    supportsNativeTools: true,
    terminalExecutionMode: request.terminalExecutionMode,
  })

  return {
    include: OPENAI_COMPATIBLE_REASONING_INCLUDE_FIELDS,
    input: buildOpenAICompatibleInput(request.messages),
    instructions,
    model: request.modelId,
    parallel_tool_calls: true,
    reasoning: {
      effort: request.reasoningEffort,
      summary: 'auto',
    },
    store: false,
    stream: true,
    tool_choice: toResponsesToolChoice(request.forceToolChoice),
    tools: buildResponsesTools(request.chatMode),
    truncation: 'auto',
  }
}

async function createOpenAICompatibleResponsesStream(
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
    return await client.responses.stream(await buildOpenAICompatibleResponsesStreamRequest(request), requestOptions)
  } catch (error) {
    if (!isUnsupportedReasoningEffortError(error)) {
      throw error
    }

    const payload = await buildOpenAICompatibleResponsesStreamRequest(request)
    delete payload.reasoning
    return client.responses.stream(payload, requestOptions)
  }
}

export async function streamOpenAICompatibleResponsesTurn(
  client: ReturnType<typeof buildOpenAIClient>,
  request: StreamOpenAICompatibleResponseInput,
  context: ProviderStreamContext,
  options: AgentLoopTurnOptions = {},
): Promise<StreamOpenAICompatibleTurnResult> {
  const stream = await createOpenAICompatibleResponsesStream(client, request, context.signal)
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
  } finally {
    context.signal.removeEventListener('abort', abortHandler)
  }

  return accumulator.buildResult()
}
