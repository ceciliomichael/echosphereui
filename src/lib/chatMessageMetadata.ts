import { getChatAttachmentSummary } from './chatAttachments'
import type { Message, UserMessageKind } from '../types/chat'

function getResolvedUserMessageKind(message: Message): UserMessageKind {
  return message.userMessageKind ?? 'human'
}

export function isSyntheticToolResultMessage(message: Message) {
  return message.role === 'tool' || (message.role === 'user' && getResolvedUserMessageKind(message) === 'tool_result')
}

export function isHumanUserMessage(message: Message) {
  return message.role === 'user' && getResolvedUserMessageKind(message) === 'human'
}

export function isVisibleTranscriptMessage(message: Message) {
  return message.role === 'assistant' || isHumanUserMessage(message)
}

export function getConversationPreviewContent(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isVisibleTranscriptMessage(message)) {
      continue
    }

    const trimmedContent = message.content.trim()
    if (trimmedContent.length > 0) {
      return message.content
    }

    const attachmentSummary = getChatAttachmentSummary(message.attachments ?? [])
    if (attachmentSummary) {
      return `Attached ${attachmentSummary}`
    }

    if (message.role === 'assistant' && (message.toolInvocations?.length ?? 0) > 0) {
      return 'Tool activity'
    }
  }

  return 'No messages yet'
}
