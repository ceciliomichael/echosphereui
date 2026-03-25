import type { Message } from '../../../src/types/chat'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function buildSerializedAssistantTurnContent(message: Pick<Message, 'content' | 'role'>) {
  if (message.role !== 'assistant') {
    return null
  }

  const content = hasText(message.content) ? message.content.trim() : null
  return content
}
