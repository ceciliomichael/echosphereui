import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { ConversationPreview, ConversationRecord, ConversationSummary, Message } from '../types/chat'

const TEST_ASSISTANT_REPLY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

function formatUpdatedAtLabel(timestamp: number) {
  const differenceMs = timestamp - Date.now()
  const differenceMinutes = Math.round(differenceMs / 60000)

  if (Math.abs(differenceMinutes) < 1) {
    return 'Now'
  }

  if (Math.abs(differenceMinutes) < 60) {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(differenceMinutes, 'minute')
  }

  const differenceHours = Math.round(differenceMinutes / 60)
  if (Math.abs(differenceHours) < 24) {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(differenceHours, 'hour')
  }

  const differenceDays = Math.round(differenceHours / 24)
  if (Math.abs(differenceDays) < 7) {
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(differenceDays, 'day')
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(timestamp)
}

function getConversationTitle(seed: string) {
  const normalized = seed.trim().replace(/\s+/g, ' ')
  const conciseTitle = normalized.split(' ').slice(0, 7).join(' ')
  return conciseTitle.length > 48 ? `${conciseTitle.slice(0, 45)}...` : conciseTitle
}

function mapConversationPreview(summary: ConversationSummary, activeConversationId: string | null): ConversationPreview {
  return {
    id: summary.id,
    title: summary.title,
    preview: summary.preview,
    updatedAtLabel: formatUpdatedAtLabel(summary.updatedAt),
    isActive: summary.id === activeConversationId,
  }
}

export function useChatMessages() {
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [mainComposerValue, setMainComposerValue] = useState('')
  const [editComposerValue, setEditComposerValue] = useState('')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editComposerFocusSignal, setEditComposerFocusSignal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function initializeConversations() {
      try {
        const summaries = await window.echosphereHistory.listConversations()

        if (!isMounted) {
          return
        }

        if (summaries.length === 0) {
          setConversationSummaries([])
          setActiveConversationId(null)
          setMessages([])
          return
        }

        setConversationSummaries(summaries)
        const firstConversation = await window.echosphereHistory.getConversation(summaries[0].id)

        if (!isMounted || !firstConversation) {
          return
        }

        setActiveConversationId(firstConversation.id)
        setMessages(firstConversation.messages)
      } catch (caughtError) {
        console.error(caughtError)
        if (isMounted) {
          setError('Unable to load saved conversations.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void initializeConversations()

    return () => {
      isMounted = false
    }
  }, [])

  async function refreshConversationSummaries(nextActiveConversationId: string | null) {
    const summaries = await window.echosphereHistory.listConversations()
    setConversationSummaries(summaries)

    if (nextActiveConversationId !== null) {
      setActiveConversationId(nextActiveConversationId)
    }
  }

  async function createConversation() {
    setError(null)
    setEditingMessageId(null)
    setMainComposerValue('')
    setEditComposerValue('')
    setActiveConversationId(null)
    setMessages([])
  }

  async function selectConversation(conversationId: string) {
    if (conversationId === activeConversationId) {
      return
    }

    setError(null)
    setEditingMessageId(null)
    setMainComposerValue('')
    setEditComposerValue('')

    try {
      const conversation = await window.echosphereHistory.getConversation(conversationId)
      if (!conversation) {
        setError('That conversation could not be loaded.')
        return
      }

      setActiveConversationId(conversation.id)
      setMessages(conversation.messages)
      await refreshConversationSummaries(conversation.id)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to switch conversations.')
    }
  }

  function startEditingMessage(messageId: string) {
    if (isSending) {
      return
    }

    const targetMessage = messages.find((message) => message.id === messageId && message.role === 'user')
    if (!targetMessage) {
      return
    }

    setError(null)
    setEditingMessageId(messageId)
    setEditComposerValue(targetMessage.content)
    setEditComposerFocusSignal((currentValue) => currentValue + 1)
  }

  function cancelEditingMessage() {
    setEditingMessageId(null)
    setEditComposerValue('')
  }

  async function persistMessageTurn(trimmedText: string, targetEditMessageId: string | null) {
    setError(null)
    setIsSending(true)
    const timestamp = Date.now()

    const userMessage: Message = {
      id: targetEditMessageId ?? uuidv4(),
      role: 'user',
      content: trimmedText,
      timestamp,
    }

    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: TEST_ASSISTANT_REPLY,
      timestamp: timestamp + 1,
    }

    const nextMessages = [userMessage, assistantMessage]

    try {
      let savedConversation: ConversationRecord

      if (targetEditMessageId !== null) {
        if (!activeConversationId) {
          throw new Error('Cannot edit a message without an active conversation.')
        }

        const currentConversation = await window.echosphereHistory.getConversation(activeConversationId)
        if (!currentConversation) {
          throw new Error(`Conversation not found: ${activeConversationId}`)
        }

        const targetMessageIndex = currentConversation.messages.findIndex(
          (message) => message.id === targetEditMessageId && message.role === 'user',
        )

        if (targetMessageIndex < 0) {
          throw new Error(`Message not found: ${targetEditMessageId}`)
        }

        const rewrittenMessages = [...currentConversation.messages.slice(0, targetMessageIndex), ...nextMessages]
        savedConversation = await window.echosphereHistory.replaceMessages({
          conversationId: currentConversation.id,
          messages: rewrittenMessages,
          title: targetMessageIndex === 0 ? getConversationTitle(trimmedText) : undefined,
        })
      } else {
        let conversationId = activeConversationId
        let currentConversation: ConversationRecord | null = null

        if (conversationId) {
          currentConversation = await window.echosphereHistory.getConversation(conversationId)
        } else {
          const createdConversation = await window.echosphereHistory.createConversation()
          conversationId = createdConversation.id
          currentConversation = createdConversation
        }

        const shouldUpdateTitle = Boolean(currentConversation && currentConversation.messages.length === 0)
        savedConversation = await window.echosphereHistory.appendMessages({
          conversationId,
          messages: nextMessages,
          title: shouldUpdateTitle ? getConversationTitle(trimmedText) : undefined,
        })
      }

      setMessages(savedConversation.messages)
      if (targetEditMessageId !== null) {
        setEditingMessageId(null)
        setEditComposerValue('')
      } else {
        setMainComposerValue('')
      }
      await refreshConversationSummaries(savedConversation.id)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to save your message.')
    } finally {
      setIsSending(false)
    }
  }

  async function sendNewMessage() {
    if (isSending) {
      return
    }

    const trimmedText = mainComposerValue.trim()
    if (trimmedText.length === 0) {
      return
    }

    await persistMessageTurn(trimmedText, null)
  }

  async function sendEditedMessage() {
    if (isSending || editingMessageId === null) {
      return
    }

    const trimmedText = editComposerValue.trim()
    if (trimmedText.length === 0) {
      return
    }

    await persistMessageTurn(trimmedText, editingMessageId)
  }

  async function deleteConversation(conversationId: string) {
    setError(null)
    if (conversationId === activeConversationId) {
      setEditingMessageId(null)
      setMainComposerValue('')
      setEditComposerValue('')
    }

    try {
      await window.echosphereHistory.deleteConversation(conversationId)
      const remainingSummaries = await window.echosphereHistory.listConversations()

      if (remainingSummaries.length === 0) {
        setConversationSummaries([])
        setActiveConversationId(null)
        setMessages([])
        setEditingMessageId(null)
        setMainComposerValue('')
        setEditComposerValue('')
        return
      }

      setConversationSummaries(remainingSummaries)

      if (conversationId !== activeConversationId) {
        return
      }

      const nextConversation = await window.echosphereHistory.getConversation(remainingSummaries[0].id)
      if (!nextConversation) {
        setError('Unable to load the next conversation after deletion.')
        return
      }

      setActiveConversationId(nextConversation.id)
      setMessages(nextConversation.messages)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to delete that conversation.')
    }
  }

  return {
    activeConversationTitle:
      conversationSummaries.find((conversation) => conversation.id === activeConversationId)?.title ?? 'New chat',
    conversations: conversationSummaries.map((conversation) =>
      mapConversationPreview(conversation, activeConversationId),
    ),
    createConversation,
    error,
    isLoading,
    isSending,
    mainComposerValue,
    editComposerValue,
    editComposerFocusSignal,
    isEditingMessage: editingMessageId !== null,
    editingMessageId,
    messages,
    cancelEditingMessage,
    setMainComposerValue,
    setEditComposerValue,
    startEditingMessage,
    deleteConversation,
    selectConversation,
    sendNewMessage,
    sendEditedMessage,
  }
}
