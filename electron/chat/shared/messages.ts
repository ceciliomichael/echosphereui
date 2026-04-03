import type { ModelMessage } from 'ai'
import { normalizeAssistantMessageContent } from '../../../src/lib/chatMessageContent'
import { getToolResultModelContent, parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import type { ChatMode, Message } from '../../../src/types/chat'

const AGENT_SYSTEM_PROMPT = `You are EchoSphere, a pragmatic desktop coding assistant.

Use the available tools to inspect the workspace before editing.
Prefer list/glob/grep/read to gather context.
Prefer apply_patch for surgical edits and apply for whole-file writes. file_change is a compatibility alias.
Treat tool results as the source of truth. Do not invent file contents or command outputs.
Keep working until the task is actually resolved.`

const PLAN_SYSTEM_PROMPT = `You are EchoSphere in planning mode.

Use the available read-only tools to inspect the workspace and form a concrete plan.
Do not make file edits in this mode.
Treat tool results as the source of truth and keep exploring until the plan is grounded in the codebase.`

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

function toToolMessage(message: Message, validToolCallIds: Set<string>): ModelMessage | null {
  if (!message.toolCallId || !validToolCallIds.has(message.toolCallId)) {
    return null
  }

  const parsedStructuredResult = parseStructuredToolResultContent(message.content)
  const toolName = parsedStructuredResult.metadata?.toolName?.trim()
  if (!toolName) {
    return null
  }

  const outputText = getToolResultModelContent(message.content)
  if (!outputText) {
    return null
  }

  return {
    content: [
      {
        output: {
          type: 'text',
          value: outputText,
        },
        toolCallId: message.toolCallId,
        toolName,
        type: 'tool-result',
      },
    ],
    role: 'tool',
  }
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
  const basePrompt = chatMode === 'plan' ? PLAN_SYSTEM_PROMPT : AGENT_SYSTEM_PROMPT
  return `${basePrompt}\n\nWorkspace root: ${workspaceRootPath}`
}

export function buildChatPrompt(input: {
  chatMode: ChatMode
  messages: Message[]
  workspaceRootPath: string
}): { messages: ModelMessage[]; system: string } {
  const validToolCallIds = new Set<string>()
  const messages = input.messages
    .map((message) => toModelMessage(message, validToolCallIds))
    .filter((message): message is ModelMessage => message !== null)

  return {
    messages,
    system: buildChatSystemPrompt(input.chatMode, input.workspaceRootPath),
  }
}
