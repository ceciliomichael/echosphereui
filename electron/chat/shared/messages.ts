import type { ModelMessage } from 'ai'
import { normalizeAssistantMessageContent } from '../../../src/lib/chatMessageContent'
import { getToolResultModelContent, parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import type { ChatMode, Message } from '../../../src/types/chat'
import { buildChatModeSystemPrompt } from './prompts/mode'

type ToolModelMessage = Extract<ModelMessage, { role: 'tool' }>
type ToolResultPart = ToolModelMessage['content'][number]

function toUserContent(message: Message) {
  const textAttachments = (message.attachments ?? [])
    .filter((attachment) => attachment.kind === 'text')
    .map((attachment) => `Attachment ${attachment.fileName}:\n${attachment.textContent}`)

  return [message.content, ...textAttachments].filter((part) => part.trim().length > 0).join('\n\n')
}

function parseToolArguments(argumentsText: string) {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    if (typeof parsedValue !== 'object' || parsedValue === null) {
      return null
    }

    return parsedValue
  } catch {
    return null
  }
}

function buildAssistantToolCallParts(message: Message, validToolCallIds: Set<string>) {
  const toolCallParts: Array<{ input: unknown; toolCallId: string; toolName: string; type: 'tool-call' }> = []

  for (const invocation of message.toolInvocations ?? []) {
    if (invocation.state === 'running') {
      continue
    }

    const parsedArguments = parseToolArguments(invocation.argumentsText)
    if (!parsedArguments) {
      continue
    }

    validToolCallIds.add(invocation.id)
    toolCallParts.push({
      input: parsedArguments,
      toolCallId: invocation.id,
      toolName: invocation.toolName,
      type: 'tool-call',
    })
  }

  return toolCallParts
}

function buildToolResultParts(message: Message, validToolCallIds: Set<string>): ToolResultPart[] {
  if (!message.toolCallId || !validToolCallIds.has(message.toolCallId)) {
    return []
  }

  const parsedStructuredResult = parseStructuredToolResultContent(message.content)
  const toolName = parsedStructuredResult.metadata?.toolName?.trim()
  if (!toolName) {
    return []
  }

  const outputText = getToolResultModelContent(message.content)
  if (!outputText) {
    return []
  }

  return [
    {
      output: {
        type: 'text',
        value: outputText,
      },
      toolCallId: message.toolCallId,
      toolName,
      type: 'tool-result',
    },
  ]
}

function toAssistantMessage(message: Message, validToolCallIds: Set<string>): ModelMessage | null {
  const normalized = normalizeAssistantMessageContent(message)
  const toolCallParts = buildAssistantToolCallParts(message, validToolCallIds)
  const text = normalized.content.trim()

  if (toolCallParts.length === 0) {
    if (!text) {
      return null
    }

    return {
      content: text,
      role: 'assistant',
    }
  }

  const contentParts: Array<
    | {
        text: string
        type: 'text'
      }
    | {
        input: unknown
        toolCallId: string
        toolName: string
        type: 'tool-call'
      }
  > = []

  if (text) {
    contentParts.push({
      text,
      type: 'text',
    })
  }

  contentParts.push(...toolCallParts)

  return {
    content: contentParts,
    role: 'assistant',
  }
}

function toToolMessage(message: Message, validToolCallIds: Set<string>): ToolModelMessage | null {
  const toolResultParts = buildToolResultParts(message, validToolCallIds)
  if (toolResultParts.length === 0) {
    return null
  }

  return {
    content: toolResultParts,
    role: 'tool',
  }
}

function appendModelMessage(messages: ModelMessage[], nextMessage: ModelMessage) {
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'tool' && nextMessage.role === 'tool') {
    // The AI SDK allows multiple `tool-result` parts in one tool message.
    // Combining consecutive tool history entries keeps the replay compact.
    lastMessage.content.push(...nextMessage.content)
    return
  }

  messages.push(nextMessage)
}

function toModelMessage(message: Message, validToolCallIds: Set<string>): ModelMessage | null {
  if (message.role === 'user') {
    const content = toUserContent(message)
    if (!content.trim()) {
      return null
    }

    return {
      content,
      role: 'user',
    }
  }

  if (message.role === 'assistant') {
    return toAssistantMessage(message, validToolCallIds)
  }

  if (message.role === 'tool') {
    return toToolMessage(message, validToolCallIds)
  }

  return null
}

export function buildChatSystemPrompt(chatMode: ChatMode, workspaceRootPath: string) {
  return buildChatModeSystemPrompt(chatMode, workspaceRootPath)
}

export function buildChatPrompt(input: {
  chatMode: ChatMode
  messages: Message[]
  workspaceRootPath: string
}): { messages: ModelMessage[]; system: string } {
  const validToolCallIds = new Set<string>()
  const messages: ModelMessage[] = []

  for (const message of input.messages) {
    const modelMessage = toModelMessage(message, validToolCallIds)
    if (!modelMessage) {
      continue
    }

    appendModelMessage(messages, modelMessage)
  }

  return {
    messages,
    system: buildChatSystemPrompt(input.chatMode, input.workspaceRootPath),
  }
}
