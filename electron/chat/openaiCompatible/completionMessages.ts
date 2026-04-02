import type {
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions/completions'
import type { ChatMode, Message } from '../../../src/types/chat'
import { getToolResultModelContent, parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import {
  buildSerializedAssistantTurnContent,
  buildSerializedAssistantTurnReasoningContent,
} from './assistantToolInvocationContext'
import { getOpenAICompatibleToolDefinitions } from './toolRegistry'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from '../providers/messageAttachments'

type OpenAICompatibleAssistantMessageWithReasoning = Extract<ChatCompletionMessageParam, { role: 'assistant' }> & {
  reasoning_content?: string
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function buildOpenAICompatibleToolCalls(
  message: Message,
  allowedToolNames: ReadonlySet<string>,
): ChatCompletionMessageToolCall[] | null {
  if (message.role !== 'assistant' || !Array.isArray(message.toolInvocations) || message.toolInvocations.length === 0) {
    return null
  }

  const toolCalls = message.toolInvocations
    .filter(
      (invocation) =>
        invocation.id.trim().length > 0 &&
        invocation.toolName.trim().length > 0 &&
        allowedToolNames.has(invocation.toolName.trim()),
    )
    .map((invocation) => ({
      function: {
        arguments: invocation.argumentsText,
        name: invocation.toolName,
      },
      id: invocation.id,
      type: 'function',
    } satisfies ChatCompletionMessageToolCall))

  return toolCalls.length > 0 ? toolCalls : null
}

function buildToolCallFromToolMessage(
  message: Message,
  allowedToolNames: ReadonlySet<string>,
): ChatCompletionMessageToolCall | null {
  if (message.role !== 'tool' || !hasNonEmptyString(message.toolCallId)) {
    return null
  }

  const parsedContent = parseStructuredToolResultContent(message.content)
  const toolName = parsedContent.metadata?.toolName?.trim() ?? ''
  const argumentsText =
    parsedContent.metadata?.arguments && Object.keys(parsedContent.metadata.arguments).length > 0
      ? JSON.stringify(parsedContent.metadata.arguments)
      : '{}'

  if (toolName.length === 0 || !allowedToolNames.has(toolName)) {
    return {
      function: {
        arguments: argumentsText,
        name: 'unknown_tool',
      },
      id: message.toolCallId,
      type: 'function',
    } satisfies ChatCompletionMessageToolCall
  }

  return {
    function: {
      arguments: argumentsText,
      name: toolName,
    },
    id: message.toolCallId,
    type: 'function',
  } satisfies ChatCompletionMessageToolCall
}

function buildOpenAICompatibleToolMessage(message: Message): ChatCompletionMessageParam | null {
  if (message.role !== 'tool' || !hasNonEmptyString(message.toolCallId)) {
    return null
  }

  return {
    content: getToolResultModelContent(message.content),
    role: 'tool',
    tool_call_id: message.toolCallId,
  }
}

function areMatchingToolCallIds(toolCalls: readonly ChatCompletionMessageToolCall[], toolMessages: readonly Message[]) {
  if (toolCalls.length !== toolMessages.length || toolCalls.length === 0) {
    return false
  }

  return toolCalls.every((toolCall, index) => toolCall.id === toolMessages[index]?.toolCallId)
}

function toOpenAICompatibleMessage(
  message: Message,
  allowedToolNames: ReadonlySet<string>,
): ChatCompletionMessageParam | OpenAICompatibleAssistantMessageWithReasoning | null {
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
    const toolCalls = buildOpenAICompatibleToolCalls(message, allowedToolNames)
    if (!hasText(content) && toolCalls === null) {
      return null
    }
    const reasoningContent = buildSerializedAssistantTurnReasoningContent(message)

    return {
      ...(hasText(content) ? { content } : { content: null }),
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
      role: 'assistant',
    }
  }

  return buildOpenAICompatibleToolMessage(message)
}

export function buildOpenAICompatibleCompletionMessages(messages: Message[], chatMode: ChatMode = 'agent') {
  const allowedToolNames = new Set(
    getOpenAICompatibleToolDefinitions(chatMode).map((toolDefinition) => toolDefinition.name),
  )
  const inputMessages: Array<ChatCompletionMessageParam | OpenAICompatibleAssistantMessageWithReasoning> = []
  const pendingToolMessages: Message[] = []

  const flushPendingToolMessages = () => {
    if (pendingToolMessages.length === 0) {
      return
    }

    const lastMessage = inputMessages.at(-1)
    const lastAssistantToolCalls = lastMessage?.role === 'assistant' ? lastMessage.tool_calls ?? [] : []
    if (!areMatchingToolCallIds(lastAssistantToolCalls, pendingToolMessages)) {
      const synthesizedToolCalls = pendingToolMessages
        .map((toolMessage) => buildToolCallFromToolMessage(toolMessage, allowedToolNames))
        .filter((value): value is ChatCompletionMessageToolCall => value !== null)

      if (synthesizedToolCalls.length > 0) {
        inputMessages.push({
          content: null,
          role: 'assistant',
          tool_calls: synthesizedToolCalls,
        })
      }
    }

    for (const toolMessage of pendingToolMessages) {
      const inputMessage = buildOpenAICompatibleToolMessage(toolMessage)
      if (inputMessage) {
        inputMessages.push(inputMessage)
      }
    }

    pendingToolMessages.length = 0
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolMessages.push(message)
      continue
    }

    flushPendingToolMessages()
    const inputMessage = toOpenAICompatibleMessage(message, allowedToolNames)
    if (inputMessage) {
      inputMessages.push(inputMessage)
    }
  }

  flushPendingToolMessages()
  return inputMessages
}
