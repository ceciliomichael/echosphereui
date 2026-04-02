import type { ChatMode, Message } from '../../../src/types/chat'
import {
  buildSerializedAssistantTurnContentWithInlineReasoning,
} from '../openaiCompatible/assistantToolInvocationContext'
import { getToolResultModelContent, parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import type { OpenAICompatibleResponsesFunctionCallOutputInput } from '../openaiCompatible/responsesState'
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

export interface CodexFunctionCallInputItem {
  arguments: string
  call_id: string
  name: string
  status?: 'in_progress' | 'completed' | 'incomplete'
  type: 'function_call'
}

export interface CodexRequestPayload {
  include: string[]
  input: Array<CodexInputMessage | CodexFunctionCallInputItem | OpenAICompatibleResponsesFunctionCallOutputInput>
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

type CodexPayloadInputItem = CodexInputMessage | CodexFunctionCallInputItem | OpenAICompatibleResponsesFunctionCallOutputInput

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function toCodexFunctionCallItem(
  invocation: NonNullable<Message['toolInvocations']>[number],
): CodexFunctionCallInputItem | null {
  if (invocation.id.trim().length === 0 || invocation.toolName.trim().length === 0) {
    return null
  }

  return {
    arguments: invocation.argumentsText,
    call_id: invocation.id,
    name: invocation.toolName,
    status: invocation.state === 'failed' ? 'incomplete' : 'completed',
    type: 'function_call',
  }
}

function buildCodexFunctionCallItemFromToolMessage(message: Message): CodexFunctionCallInputItem | null {
  if (message.role !== 'tool' || !hasText(message.toolCallId)) {
    return null
  }

  const metadata = parseStructuredToolResultContent(message.content).metadata

  const toolName = typeof metadata?.toolName === 'string' && metadata.toolName.trim().length > 0 ? metadata.toolName : 'unknown_tool'
  const argumentsText =
    metadata?.arguments && Object.keys(metadata.arguments).length > 0 ? JSON.stringify(metadata.arguments) : '{}'

  return {
    arguments: argumentsText,
    call_id: message.toolCallId,
    name: toolName,
    status: 'completed',
    type: 'function_call',
  }
}

function toCodexInputItems(
  message: Message,
): Array<CodexInputMessage | CodexFunctionCallInputItem | OpenAICompatibleResponsesFunctionCallOutputInput> {
  if (message.role === 'tool') {
    if (!hasText(message.content) || !hasText(message.toolCallId)) {
      return []
    }

    return [
      {
        call_id: message.toolCallId,
        output: getToolResultModelContent(message.content),
        type: 'function_call_output',
      },
    ]
  }

  if (message.role === 'assistant') {
    const inputItems: Array<CodexInputMessage | CodexFunctionCallInputItem> = []
    const content = buildSerializedAssistantTurnContentWithInlineReasoning(message)
    if (hasText(content)) {
      inputItems.push({
        role: 'assistant',
        content: [{ text: content, type: 'output_text' }],
      })
    }

    for (const invocation of message.toolInvocations ?? []) {
      const functionCallItem = toCodexFunctionCallItem(invocation)
      if (functionCallItem) {
        inputItems.push(functionCallItem)
      }
    }

    return inputItems
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
    return []
  }

  return [{ role: 'user', content }]
}

export function buildCodexInputMessages(messages: Message[]) {
  const toolMessageCallIds = new Set(
    messages
      .filter((message) => message.role === 'tool' && hasText(message.toolCallId))
      .map((message) => message.toolCallId as string),
  )

  const inputItems: CodexPayloadInputItem[] = []
  const emittedFunctionCallIds = new Set<string>()
  const emittedFunctionCallOutputIds = new Set<string>()

  for (const message of messages) {
    if (message.role === 'tool') {
      if (!hasText(message.toolCallId) || emittedFunctionCallOutputIds.has(message.toolCallId)) {
        continue
      }

      if (!emittedFunctionCallIds.has(message.toolCallId)) {
        const synthesizedCall = buildCodexFunctionCallItemFromToolMessage(message)
        if (synthesizedCall) {
          inputItems.push(synthesizedCall)
          emittedFunctionCallIds.add(synthesizedCall.call_id)
        }
      }

      const toolOutputItems = toCodexInputItems(message)
      if (toolOutputItems.length > 0) {
        inputItems.push(...toolOutputItems)
        emittedFunctionCallOutputIds.add(message.toolCallId)
      }
      continue
    }

    if (message.role === 'assistant' && Array.isArray(message.toolInvocations) && message.toolInvocations.length > 0) {
      const keptToolInvocations = message.toolInvocations.filter((invocation) => toolMessageCallIds.has(invocation.id))
      const filteredMessage: Message = {
        ...message,
        toolInvocations: keptToolInvocations,
      }
      const nextItems = toCodexInputItems(filteredMessage)
      inputItems.push(...nextItems)
      for (const invocation of keptToolInvocations) {
        emittedFunctionCallIds.add(invocation.id)
      }
      continue
    }

    inputItems.push(...toCodexInputItems(message))
  }

  return inputItems
}

function stripCodexInputItemIds(item: CodexPayloadInputItem): CodexPayloadInputItem {
  if (!('id' in item)) {
    return item
  }

  const rest = { ...item }
  delete rest.id
  return rest as CodexPayloadInputItem
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
    input: buildCodexInputMessages(request.messages).map((item) => stripCodexInputItemIds(item)),
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
