import type { Message } from '../../../src/types/chat'

export const TOOL_RESULT_TO_USER_BRIDGE_TEXT =
  '[Received tool results above. The following is a new message from the user.]'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isRuntimeContextUpdateToolResultMessage(message: Message) {
  if (message.role !== 'user' || message.userMessageKind !== 'tool_result') {
    return false
  }

  const content = message.content
  return content.includes('<context_update>') && content.includes('echosphere.runtime_context/v1')
}

export function isToolResultUserMessage(message: Message) {
  return message.role === 'user' && message.userMessageKind === 'tool_result'
}

export function isReplayToolResultUserMessage(message: Message) {
  return isToolResultUserMessage(message) && !isRuntimeContextUpdateToolResultMessage(message)
}

export function isHumanUserMessage(message: Message) {
  return message.role === 'user' && message.userMessageKind !== 'tool_result'
}

export function isToolOutputMessageContent(content: string) {
  return hasText(content)
}

export function ensureToolOutputMessageEnvelope(content: string) {
  if (!hasText(content)) {
    return content
  }

  return content.trim()
}
