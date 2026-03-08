import { useState } from 'react'
import type { Message } from '../types/chat'

export function useChatComposerState(messages: Message[], isSending: boolean) {
  const [mainComposerValue, setMainComposerValue] = useState('')
  const [editComposerValue, setEditComposerValue] = useState('')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editComposerFocusSignal, setEditComposerFocusSignal] = useState(0)

  function resetComposerState() {
    setEditingMessageId(null)
    setMainComposerValue('')
    setEditComposerValue('')
  }

  function startEditingMessage(messageId: string) {
    if (isSending) {
      return
    }

    const targetMessage = messages.find((message) => message.id === messageId && message.role === 'user')
    if (!targetMessage) {
      return
    }

    setEditingMessageId(messageId)
    setEditComposerValue(targetMessage.content)
    setEditComposerFocusSignal((currentValue) => currentValue + 1)
  }

  function cancelEditingMessage() {
    setEditingMessageId(null)
    setEditComposerValue('')
  }

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
