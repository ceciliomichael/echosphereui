import type { Message } from '../../../src/types/chat'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function buildSerializedAssistantTurnReasoningContent(message: Pick<Message, 'reasoningContent' | 'role'>) {
  if (message.role !== 'assistant') {
    return null
  }

  return hasText(message.reasoningContent) ? message.reasoningContent.trim() : null
}

export function buildSerializedAssistantTurnContent(message: Pick<Message, 'content' | 'role'>) {
  if (message.role !== 'assistant') {
    return null
  }

  const content = hasText(message.content) ? message.content.trim() : null
  return content
}

export function buildSerializedAssistantTurnContentWithInlineReasoning(
  message: Pick<Message, 'content' | 'reasoningContent' | 'role'>,
) {
  const content = buildSerializedAssistantTurnContent(message)
  if (!content) {
    return null
  }

  const reasoningContent = buildSerializedAssistantTurnReasoningContent(message)
  if (!reasoningContent) {
    return content
  }

  return `<think>\n${reasoningContent}\n</think>\n\n${content}`
}
