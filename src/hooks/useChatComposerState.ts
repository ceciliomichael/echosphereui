import { useCallback, useEffect, useRef, useState } from 'react'
import { isHumanUserMessage } from '../lib/chatMessageMetadata'
import { buildChatMentionPathMap, collapseChatMentionMarkup } from '../lib/chatMentions'
import type { ChatAttachment, Message } from '../types/chat'

function getAttachmentFingerprint(attachment: ChatAttachment) {
  return attachment.kind === 'image'
    ? [
        attachment.id,
        attachment.kind,
        attachment.fileName,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.dataUrl,
      ].join('::')
    : [
        attachment.id,
        attachment.kind,
        attachment.fileName,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.textContent,
      ].join('::')
}

function haveSameAttachments(left: readonly ChatAttachment[], right: readonly ChatAttachment[]) {
  return (
    left.length === right.length &&
    left.every((attachment, index) => getAttachmentFingerprint(attachment) === getAttachmentFingerprint(right[index]))
  )
}

export function useChatComposerState(messages: Message[]) {
  const [mainComposerValue, setMainComposerValue] = useState('')
  const [mainComposerAttachments, setMainComposerAttachments] = useState<ChatAttachment[]>([])
  const [editComposerValue, setEditComposerValue] = useState('')
  const [editComposerAttachments, setEditComposerAttachments] = useState<ChatAttachment[]>([])
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editComposerFocusSignal, setEditComposerFocusSignal] = useState(0)
  const [editInitialValue, setEditInitialValue] = useState('')
  const [editInitialAttachments, setEditInitialAttachments] = useState<ChatAttachment[]>([])
  const [editComposerMentionPathMap, setEditComposerMentionPathMap] = useState<Map<string, string>>(() => new Map())
  const messagesRef = useRef(messages)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const resetComposerState = useCallback(() => {
    setEditingMessageId(null)
    setMainComposerValue('')
    setMainComposerAttachments([])
    setEditComposerValue('')
    setEditComposerAttachments([])
    setEditInitialValue('')
    setEditInitialAttachments([])
    setEditComposerMentionPathMap(new Map())
  }, [])

  const startEditingMessage = useCallback((messageId: string) => {
    const targetMessage = messagesRef.current.find((message) => message.id === messageId && isHumanUserMessage(message))
    if (!targetMessage) {
      return
    }

    const collapsedContent = collapseChatMentionMarkup(targetMessage.content)
    setEditingMessageId(messageId)
    setEditComposerValue(collapsedContent)
    setEditComposerAttachments(targetMessage.attachments ?? [])
    setEditInitialValue(collapsedContent)
    setEditInitialAttachments(targetMessage.attachments ?? [])
    setEditComposerMentionPathMap(buildChatMentionPathMap(targetMessage.content))
    setEditComposerFocusSignal((currentValue) => currentValue + 1)
  }, [])

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null)
    setEditComposerValue('')
    setEditComposerAttachments([])
    setEditInitialValue('')
    setEditInitialAttachments([])
    setEditComposerMentionPathMap(new Map())
  }, [])

  const isEditComposerDirty =
    editComposerValue !== editInitialValue || !haveSameAttachments(editComposerAttachments, editInitialAttachments)

  return {
    mainComposerValue,
    setMainComposerValue,
    mainComposerAttachments,
    setMainComposerAttachments,
    editComposerValue,
    setEditComposerValue,
    editComposerAttachments,
    setEditComposerAttachments,
    editComposerMentionPathMap,
    isEditComposerDirty,
    editingMessageId,
    editComposerFocusSignal,
    resetComposerState,
    startEditingMessage,
    cancelEditingMessage,
  }
}
