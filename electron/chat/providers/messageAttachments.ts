import { buildImageAttachmentPrompt, buildTextAttachmentPrompt } from '../../../src/lib/chatAttachments'
import type { ChatImageAttachment, Message } from '../../../src/types/chat'

export interface ParsedInlineImageData {
  base64Data: string
  mimeType: string
}

export function getUserMessageTextBlocks(message: Message, includeImageFallbackText = false) {
  if (message.role !== 'user') {
    return message.content.trim().length > 0 ? [message.content] : []
  }

  const blocks: string[] = []
  if (message.content.trim().length > 0) {
    blocks.push(message.content)
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === 'text') {
      blocks.push(buildTextAttachmentPrompt(attachment))
      continue
    }

    if (includeImageFallbackText) {
      blocks.push(buildImageAttachmentPrompt(attachment))
    }
  }

  return blocks
}

export function getUserMessageImageAttachments(message: Message) {
  if (message.role !== 'user') {
    return []
  }

  return (message.attachments ?? []).filter(
    (attachment): attachment is ChatImageAttachment => attachment.kind === 'image',
  )
}

export function parseInlineImageData(attachment: ChatImageAttachment): ParsedInlineImageData | null {
  const dataUrlMatch = attachment.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!dataUrlMatch) {
    return null
  }

  const [, mimeTypeFromDataUrl, base64Data] = dataUrlMatch
  const mimeType = attachment.mimeType.trim() || mimeTypeFromDataUrl.trim()
  if (mimeType.length === 0 || base64Data.trim().length === 0) {
    return null
  }

  return {
    base64Data,
    mimeType,
  }
}
