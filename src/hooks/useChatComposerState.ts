import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message } from '../types/chat'

export function useChatComposerState(messages: Message[], isSending: boolean) {
  const [mainComposerValue, setMainComposerValue] = useState('')
  const [editComposerValue, setEditComposerValue] = useState('')
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
    setEditComposerValue('')
  }, [])

  const startEditingMessage = useCallback((messageId: string) => {
    if (isSendingRef.current) {
      return
    }

    const targetMessage = messagesRef.current.find((message) => message.id === messageId && message.role === 'user')
    if (!targetMessage) {
      return
    }

    setEditingMessageId(messageId)
    setEditComposerValue(targetMessage.content)
    setEditComposerFocusSignal((currentValue) => currentValue + 1)
  }, [])

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null)
    setEditComposerValue('')
  }, [])

  return {
    mainComposerValue,
    setMainComposerValue,
    editComposerValue,
    setEditComposerValue,
    editingMessageId,
    editComposerFocusSignal,
    resetComposerState,
    startEditingMessage,
    cancelEditingMessage,
  }
}
