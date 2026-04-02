import type { Message } from '../../../src/types/chat'
import { normalizeAssistantMessageContent } from '../../../src/lib/chatMessageContent'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function buildSerializedAssistantTurnReasoningContent(
  message: Pick<Message, 'content' | 'reasoningContent' | 'role'>,
) {
  if (message.role !== 'assistant') {
    return null
  }

  const normalizedContent = normalizeAssistantMessageContent(message)
  return hasText(normalizedContent.reasoningContent) ? normalizedContent.reasoningContent.trim() : null
}

export function buildSerializedAssistantTurnContent(message: Pick<Message, 'content' | 'reasoningContent' | 'role'>) {
  if (message.role !== 'assistant') {
    return null
  }

  const normalizedContent = normalizeAssistantMessageContent(message)
  const content = hasText(normalizedContent.content) ? normalizedContent.content.trim() : null
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
