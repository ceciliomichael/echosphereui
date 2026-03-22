import type { ChatMode, Message } from '../../../src/types/chat'
import { buildSerializedAssistantTurnContent } from '../openaiCompatible/assistantToolInvocationContext'
import { buildCodexGroupedToolResultContent } from '../openaiCompatible/toolResultFormatter'
import {
  ensureToolOutputMessageEnvelope,
  isReplayToolResultUserMessage,
} from '../openaiCompatible/toolResultReplayEnvelope'
import { getOpenAICompatibleToolDefinitions } from '../openaiCompatible/toolRegistry'
import { buildSystemPrompt } from '../prompts'
import type { ProviderStreamRequest } from '../providerTypes'
import { getUserMessageImageAttachments, getUserMessageTextBlocks } from './messageAttachments'

export interface CodexFunctionToolDefinition {
  description: string
  name: string
  parameters: Record<string, unknown>
  type: 'function'
}

export interface CodexMessageContentItem {
  detail?: 'auto'
  image_url?: string
  text?: string
  type: 'input_text' | 'output_text' | 'input_image'
}

export interface CodexInputMessage {
  content: CodexMessageContentItem[]
  role: 'assistant' | 'user'
}

export interface CodexRequestPayload {
  include: string[]
  input: CodexInputMessage[]
  instructions: string
  model: string
  parallel_tool_calls: boolean
  reasoning: {
    effort: string
    summary: 'auto'
  }
  store: false
  stream: true
  tool_choice: 'auto'
  tools: CodexFunctionToolDefinition[]
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function toCodexInputMessage(message: Message): CodexInputMessage | null {
  if (message.role === 'assistant') {
    const content = buildSerializedAssistantTurnContent(message)
    if (!hasText(content)) {
      return null
    }

    return {
      role: 'assistant',
      content: [{ text: content, type: 'output_text' }],
    }
  }

  const content: CodexMessageContentItem[] = []

  for (const textBlock of getUserMessageTextBlocks(message)) {
    content.push({
      text: textBlock,
      type: 'input_text',
    })
  }

  for (const attachment of getUserMessageImageAttachments(message)) {
    content.push({
      detail: 'auto',
      image_url: attachment.dataUrl,
      type: 'input_image',
    })
  }

  if (content.length === 0) {
    return null
  }

  return {
    role: 'user',
    content,
  }
}

export function buildCodexInputMessages(messages: Message[]) {
  const inputMessages: CodexInputMessage[] = []
  const pendingToolContentsByTurn: string[] = []

  const flushPendingToolContents = () => {
    const groupedContent = buildCodexGroupedToolResultContent(pendingToolContentsByTurn)
    pendingToolContentsByTurn.length = 0

    if (!groupedContent) {
      return
    }

    inputMessages.push({
      content: [{ text: ensureToolOutputMessageEnvelope(groupedContent), type: 'input_text' }],
      role: 'user',
    })
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      if (hasText(message.content)) {
        pendingToolContentsByTurn.push(message.content)
      }
      continue
    }

    if (isReplayToolResultUserMessage(message)) {
      flushPendingToolContents()
      const toolResultInputMessage = toCodexInputMessage({
        ...message,
        content: ensureToolOutputMessageEnvelope(message.content),
      })
      if (toolResultInputMessage) {
        inputMessages.push(toolResultInputMessage)
      }
      continue
    }

    flushPendingToolContents()
    const inputMessage = toCodexInputMessage(message)
    if (inputMessage) {
      inputMessages.push(inputMessage)
    }
  }

  flushPendingToolContents()
  return inputMessages
}

export function getCodexToolDefinitions(chatMode: ChatMode): CodexFunctionToolDefinition[] {
  return getOpenAICompatibleToolDefinitions(chatMode).map((toolDefinition) => {
    if (toolDefinition.tool.type !== 'function') {
      throw new Error(`Unsupported tool type for Codex: ${toolDefinition.tool.type}`)
    }

    return {
      description: toolDefinition.tool.function.description ?? '',
      name: toolDefinition.tool.function.name,
      parameters: toolDefinition.tool.function.parameters as Record<string, unknown>,
      type: 'function',
    }
  })
}

export async function buildCodexPayload(
  request: ProviderStreamRequest,
  messages: Message[],
): Promise<CodexRequestPayload> {
  const instructions = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    providerId: request.providerId,
    supportsNativeTools: true,
    terminalExecutionMode: request.terminalExecutionMode,
  })

  return {
    include: ['reasoning.encrypted_content'],
    input: buildCodexInputMessages(messages),
    instructions,
    model: request.modelId,
    parallel_tool_calls: true,
    reasoning: {
      effort: request.reasoningEffort,
      summary: 'auto',
    },
    store: false,
    stream: true,
    tool_choice: 'auto',
    tools: getCodexToolDefinitions(request.chatMode),
  }
}
