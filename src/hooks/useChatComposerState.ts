import { useCallback, useEffect, useRef, useState } from 'react'
import { isHumanUserMessage } from '../lib/chatMessageMetadata'
import type { ChatAttachment, Message } from '../types/chat'

export function useChatComposerState(messages: Message[], isSending: boolean) {
  const [mainComposerValue, setMainComposerValue] = useState('')
  const [mainComposerAttachments, setMainComposerAttachments] = useState<ChatAttachment[]>([])
  const [editComposerValue, setEditComposerValue] = useState('')
  const [editComposerAttachments, setEditComposerAttachments] = useState<ChatAttachment[]>([])
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editComposerFocusSignal, setEditComposerFocusSignal] = useState(0)
  const messagesRef = useRef(messages)
  const isSendingRef = useRef(isSending)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    isSendingRef.current = isSending
  }, [isSending])

  const resetComposerState = useCallback(() => {
    setEditingMessageId(null)
    setMainComposerValue('')
    setMainComposerAttachments([])
    setEditComposerValue('')
    setEditComposerAttachments([])
  }, [])

  const startEditingMessage = useCallback((messageId: string) => {
    if (isSendingRef.current) {
      return
    }

    const targetMessage = messagesRef.current.find((message) => message.id === messageId && isHumanUserMessage(message))
    if (!targetMessage) {
      return
    }

    setEditingMessageId(messageId)
    setEditComposerValue(targetMessage.content)
    setEditComposerAttachments(targetMessage.attachments ?? [])
    setEditComposerFocusSignal((currentValue) => currentValue + 1)
  }, [])

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null)
    setEditComposerValue('')
    setEditComposerAttachments([])
  }, [])

  return {
    mainComposerValue,
    setMainComposerValue,
    mainComposerAttachments,
    setMainComposerAttachments,
    editComposerValue,
    setEditComposerValue,
    editComposerAttachments,
    setEditComposerAttachments,
    editingMessageId,
    editComposerFocusSignal,
    resetComposerState,
    startEditingMessage,
    cancelEditingMessage,
  }
}
