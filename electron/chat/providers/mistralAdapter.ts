import { randomUUID } from 'node:crypto'
import type { ChatCompletionStreamRequestMessages, CompletionEvent, ContentChunk } from '@mistralai/mistralai/models/components'
import type { Message } from '../../../src/types/chat'
import { streamAgentLoopWithTools, type AgentLoopTurnOptions } from '../agentLoop/runtime'
import type { ChatProviderAdapter, ProviderStreamContext } from '../providerTypes'
import { buildSystemPrompt } from '../prompts'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from './messageAttachments'
import { buildMistralToolDefinitions, toMistralToolChoice } from './providerNativeTools'
import { buildMistralClient, loadMistralProviderConfig } from './mistralShared'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'

interface ToolCallAccumulator {
  argumentsText: string
  id: string
  name: string
  startedAt: number | null
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCompleteJsonObject(argumentsText: string) {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    return typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue)
  } catch {
    return false
  }
}

function stringifyToolArguments(argumentsValue: unknown) {
  if (typeof argumentsValue === 'string') {
    return argumentsValue
  }

  try {
    return JSON.stringify(argumentsValue)
  } catch {
    return ''
  }
}

function extractTextFromContentChunks(content: ContentChunk[]) {
  let assistantText = ''
  let reasoningText = ''

  for (const chunk of content) {
    if (chunk.type === 'text' && hasText(chunk.text)) {
      assistantText += chunk.text
    } else if (chunk.type === 'thinking') {
      for (const thought of chunk.thinking) {
        if (thought.type === 'text' && hasText(thought.text)) {
          reasoningText += thought.text
        }
      }
    }
  }

  return {
    assistantText,
    reasoningText,
  }
}

function toMistralMessage(message: Message): ChatCompletionStreamRequestMessages | null {
  if (message.role === 'user') {
    const textBlocks = getUserMessageTextBlocks(message)
    const imageAttachments = getUserMessageImageAttachments(message)

    const content: ContentChunk[] = [
      ...textBlocks.map((textBlock) => ({
        text: textBlock,
        type: 'text' as const,
      })),
      ...imageAttachments.map((attachment) => ({
        imageUrl: {
          url: attachment.dataUrl,
        },
        type: 'image_url' as const,
      })),
    ]

    if (content.length === 0) {
      return null
    }

    return {
      content,
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

  if (!hasText(message.toolCallId)) {
    return null
  }

  return {
    content: message.content,
    role: 'tool',
    toolCallId: message.toolCallId,
  }
}

async function buildMistralMessages(request: {
  agentContextRootPath: string
  chatMode: 'agent' | 'plan'
  messages: Message[]
  terminalExecutionMode: 'full' | 'sandbox'
}) {
  const systemPrompt = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    providerId: 'mistral',
    supportsNativeTools: true,
    terminalExecutionMode: request.terminalExecutionMode,
  })

  const messages = [
    {
      content: systemPrompt,
      role: 'system' as const,
    },
    ...request.messages
      .map(toMistralMessage)
      .filter((value): value is ChatCompletionStreamRequestMessages => value !== null),
  ]

  while (messages.length > 1) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== 'assistant') {
      break
    }

    messages.pop()
  }

  const lastMessage = messages[messages.length - 1]
  if (!lastMessage || (lastMessage.role !== 'user' && lastMessage.role !== 'tool')) {
    throw new Error('Unable to send the request because the latest message is not a user/tool turn.')
  }

  return messages
}

function emitToolCallDeltaEvents(
  event: CompletionEvent,
  toolCallsByIndex: Map<number, ToolCallAccumulator>,
  context: ProviderStreamContext,
  readyToolCallIndexes: Set<number>,
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void,
) {
  for (const choice of event.data.choices) {
    const toolCalls = Array.isArray(choice.delta.toolCalls) ? choice.delta.toolCalls : []
    for (const [fallbackIndex, toolCall] of toolCalls.entries()) {
      const toolIndex =
        typeof toolCall.index === 'number' && Number.isFinite(toolCall.index) ? toolCall.index : fallbackIndex
      const currentToolCall = toolCallsByIndex.get(toolIndex) ?? {
        argumentsText: '',
        id: toolCall.id ?? randomUUID(),
        name: '',
        startedAt: null,
      }
      const previousArgumentsText = currentToolCall.argumentsText
      const argumentsText = stringifyToolArguments(toolCall.function.arguments)

      if (hasText(toolCall.id)) {
        currentToolCall.id = toolCall.id
      }

      if (hasText(toolCall.function.name)) {
        currentToolCall.name = toolCall.function.name
      }

      if (hasText(argumentsText)) {
        currentToolCall.argumentsText += argumentsText
      }

      if (currentToolCall.startedAt === null && currentToolCall.name.trim().length > 0) {
        currentToolCall.startedAt = Date.now()
        context.emitDelta({
          argumentsText: currentToolCall.argumentsText,
          invocationId: currentToolCall.id,
          startedAt: currentToolCall.startedAt,
          toolName: currentToolCall.name,
          type: 'tool_invocation_started',
        })
      } else if (
        currentToolCall.startedAt !== null &&
        currentToolCall.argumentsText !== previousArgumentsText
      ) {
        context.emitDelta({
          argumentsText: currentToolCall.argumentsText,
          invocationId: currentToolCall.id,
          toolName: currentToolCall.name,
          type: 'tool_invocation_delta',
        })
      }

      toolCallsByIndex.set(toolIndex, currentToolCall)

      if (
        onToolCallReady &&
        !readyToolCallIndexes.has(toolIndex) &&
        currentToolCall.name.trim().length > 0 &&
        isCompleteJsonObject(currentToolCall.argumentsText)
      ) {
        readyToolCallIndexes.add(toolIndex)
        onToolCallReady({
          argumentsText: currentToolCall.argumentsText,
          id: currentToolCall.id,
          name: currentToolCall.name,
          startedAt: currentToolCall.startedAt ?? Date.now(),
        })
      }
    }
  }
}

function toToolCallList(toolCallsByIndex: Map<number, ToolCallAccumulator>) {
  return Array.from(toolCallsByIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, toolCall]) => ({
      argumentsText: toolCall.argumentsText,
      id: toolCall.id,
      name: toolCall.name,
      startedAt: toolCall.startedAt ?? Date.now(),
    }))
}

async function streamMistralTurn(
  client: ReturnType<typeof buildMistralClient>,
  request: {
    agentContextRootPath: string
    chatMode: 'agent' | 'plan'
    forceToolChoice?: 'none' | 'required'
    messages: Message[]
    modelId: string
    terminalExecutionMode: 'full' | 'sandbox'
  },
  context: ProviderStreamContext,
  options: AgentLoopTurnOptions = {},
) {
  const stream = await client.chat.stream(
    {
      messages: await buildMistralMessages({
        agentContextRootPath: request.agentContextRootPath,
        chatMode: request.chatMode,
        messages: request.messages,
        terminalExecutionMode: request.terminalExecutionMode,
      }),
      model: request.modelId,
      parallelToolCalls: true,
      toolChoice: toMistralToolChoice(request.forceToolChoice),
      tools: buildMistralToolDefinitions(request.chatMode),
    },
    {
      signal: context.signal,
      timeoutMs: 120_000,
    },
  )

  const toolCallsByIndex = new Map<number, ToolCallAccumulator>()
  const readyToolCallIndexes = new Set<number>()
  let assistantContent = ''

  for await (const event of stream) {
    for (const choice of event.data.choices) {
      const content = choice.delta.content
      if (typeof content === 'string' && content.length > 0) {
        assistantContent += content
        context.emitDelta({
          delta: content,
          type: 'content_delta',
        })
      } else if (Array.isArray(content)) {
        const extractedContent = extractTextFromContentChunks(content)
        if (extractedContent.assistantText.length > 0) {
          assistantContent += extractedContent.assistantText
          context.emitDelta({
            delta: extractedContent.assistantText,
            type: 'content_delta',
          })
        }

        if (extractedContent.reasoningText.length > 0) {
          context.emitDelta({
            delta: extractedContent.reasoningText,
            type: 'reasoning_delta',
          })
        }
      }
    }

    emitToolCallDeltaEvents(event, toolCallsByIndex, context, readyToolCallIndexes, options.onToolCallReady)
  }

  return {
    assistantContent,
    toolCalls: toToolCallList(toolCallsByIndex),
  }
}

export const mistralChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'mistral' as const,
  async streamResponse(request, context) {
    const providerConfig = await loadMistralProviderConfig()
    const client = buildMistralClient(providerConfig)

    try {
      await streamAgentLoopWithTools(
        {
          agentContextRootPath: request.agentContextRootPath,
          chatMode: request.chatMode,
          messages: request.messages,
          modelId: request.modelId,
          providerId: request.providerId,
          reasoningEffort: request.reasoningEffort,
          terminalExecutionMode: request.terminalExecutionMode,
        },
        context,
        (turnRequest, turnContext, options) =>
          streamMistralTurn(
            client,
            {
              agentContextRootPath: turnRequest.agentContextRootPath,
              chatMode: turnRequest.chatMode,
              forceToolChoice: turnRequest.forceToolChoice,
              messages: turnRequest.messages,
              modelId: turnRequest.modelId,
              terminalExecutionMode: request.terminalExecutionMode,
            },
            turnContext,
            options,
          ),
      )
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      throw error
    }
  },
}
