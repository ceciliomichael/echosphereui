import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type {
  ConversationFolderSummary,
  ConversationGroupPreview,
  ConversationPreview,
  ConversationRecord,
  ConversationSummary,
  Message,
} from '../types/chat'

const TEST_ASSISTANT_REPLY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

const UNFILED_FOLDER_NAME = 'Unfiled'

function getSelectedFolderName(
  folderSummaries: ConversationFolderSummary[],
  selectedFolderId: string | null,
) {
  if (selectedFolderId === null) {
    return UNFILED_FOLDER_NAME
  }

  return folderSummaries.find((folder) => folder.id === selectedFolderId)?.name ?? UNFILED_FOLDER_NAME
}

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
    folderId: summary.folderId,
    isActive: summary.id === activeConversationId,
  }
}

function buildConversationGroups(
  folderSummaries: ConversationFolderSummary[],
  conversationSummaries: ConversationSummary[],
  activeConversationId: string | null,
  selectedFolderId: string | null,
): ConversationGroupPreview[] {
  const groupedConversations = new Map<string | null, ConversationPreview[]>()
  groupedConversations.set(null, [])

  for (const folder of folderSummaries) {
    groupedConversations.set(folder.id, [])
  }

  for (const conversation of conversationSummaries) {
    const preview = mapConversationPreview(conversation, activeConversationId)
    const targetFolderId =
      conversation.folderId !== null && groupedConversations.has(conversation.folderId) ? conversation.folderId : null

    groupedConversations.get(targetFolderId)?.push(preview)
  }

  return [
    {
      folder: {
        id: null,
        name: UNFILED_FOLDER_NAME,
        path: null,
        conversationCount: groupedConversations.get(null)?.length ?? 0,
        isSelected: selectedFolderId === null,
      },
      conversations: groupedConversations.get(null) ?? [],
    },
    ...folderSummaries.map((folder) => ({
      folder: {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        conversationCount: groupedConversations.get(folder.id)?.length ?? 0,
        isSelected: selectedFolderId === folder.id,
      },
      conversations: groupedConversations.get(folder.id) ?? [],
    })),
  ]
}

export function useChatMessages() {
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([])
  const [folderSummaries, setFolderSummaries] = useState<ConversationFolderSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [mainComposerValue, setMainComposerValue] = useState('')
  const [editComposerValue, setEditComposerValue] = useState('')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editComposerFocusSignal, setEditComposerFocusSignal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetDraft(nextFolderId: string | null) {
    setEditingMessageId(null)
    setMainComposerValue('')
    setEditComposerValue('')
    setActiveConversationId(null)
    setSelectedFolderId(nextFolderId)
    setMessages([])
  }

  async function refreshSidebarData(nextActiveConversationId: string | null, nextSelectedFolderId: string | null) {
    const [summaries, folders] = await Promise.all([
      window.echosphereHistory.listConversations(),
      window.echosphereHistory.listFolders(),
    ])

    setConversationSummaries(summaries)
    setFolderSummaries(folders)
    setActiveConversationId(nextActiveConversationId)

    if (nextActiveConversationId !== null) {
      const activeConversation = summaries.find((conversation) => conversation.id === nextActiveConversationId)
      setSelectedFolderId(activeConversation?.folderId ?? null)
      return
    }

    const hasSelectedFolder =
      nextSelectedFolderId === null || folders.some((folder) => folder.id === nextSelectedFolderId)
    setSelectedFolderId(hasSelectedFolder ? nextSelectedFolderId : null)
  }

  useEffect(() => {
    let isMounted = true

    async function initializeConversations() {
      try {
        const [summaries, folders] = await Promise.all([
          window.echosphereHistory.listConversations(),
          window.echosphereHistory.listFolders(),
        ])

        if (!isMounted) {
          return
        }

        setConversationSummaries(summaries)
        setFolderSummaries(folders)

        if (summaries.length === 0) {
          setSelectedFolderId(null)
          setActiveConversationId(null)
          setMessages([])
          return
        }

        const firstConversation = await window.echosphereHistory.getConversation(summaries[0].id)

        if (!isMounted || !firstConversation) {
          return
        }

        setActiveConversationId(firstConversation.id)
        setSelectedFolderId(firstConversation.folderId)
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

  function createConversation(folderId = selectedFolderId) {
    setError(null)
    resetDraft(folderId)
  }

  async function createFolder() {
    setError(null)

    try {
      const folder = await window.echosphereHistory.pickFolder()
      if (!folder) {
        return
      }

      resetDraft(folder.id)
      await refreshSidebarData(null, folder.id)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to create that folder.')
      throw caughtError
    }
  }

  async function openFolderPath(folderPath: string) {
    setError(null)

    try {
      await window.echosphereHistory.openFolderPath(folderPath)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to open that folder.')
    }
  }

  function selectFolder(folderId: string | null) {
    setError(null)
    resetDraft(folderId)
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
      setSelectedFolderId(conversation.folderId)
      setMessages(conversation.messages)
      await refreshSidebarData(conversation.id, conversation.folderId)
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
          const createdConversation = await window.echosphereHistory.createConversation({ folderId: selectedFolderId })
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
      setSelectedFolderId(savedConversation.folderId)

      if (targetEditMessageId !== null) {
        setEditingMessageId(null)
        setEditComposerValue('')
      } else {
        setMainComposerValue('')
      }

      await refreshSidebarData(savedConversation.id, savedConversation.folderId)
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
    const deletedConversationFolderId =
      conversationSummaries.find((conversation) => conversation.id === conversationId)?.folderId ?? null

    if (conversationId === activeConversationId) {
      setEditingMessageId(null)
      setMainComposerValue('')
      setEditComposerValue('')
    }

    try {
      await window.echosphereHistory.deleteConversation(conversationId)
      const [remainingSummaries, folders] = await Promise.all([
        window.echosphereHistory.listConversations(),
        window.echosphereHistory.listFolders(),
      ])

      setConversationSummaries(remainingSummaries)
      setFolderSummaries(folders)

      if (remainingSummaries.length === 0) {
        setActiveConversationId(null)
        setSelectedFolderId(deletedConversationFolderId)
        setMessages([])
        setEditingMessageId(null)
        setMainComposerValue('')
        setEditComposerValue('')
        return
      }

      if (conversationId !== activeConversationId) {
        return
      }

      const nextConversation = await window.echosphereHistory.getConversation(remainingSummaries[0].id)
      if (!nextConversation) {
        setError('Unable to load the next conversation after deletion.')
        return
      }

      setActiveConversationId(nextConversation.id)
      setSelectedFolderId(nextConversation.folderId)
      setMessages(nextConversation.messages)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to delete that conversation.')
    }
  }

  return {
    activeConversationTitle:
      conversationSummaries.find((conversation) => conversation.id === activeConversationId)?.title ?? 'New thread',
    conversationGroups: buildConversationGroups(
      folderSummaries,
      conversationSummaries,
      activeConversationId,
      selectedFolderId,
    ),
    createConversation,
    createFolder,
    openFolderPath,
    error,
    selectedFolderName: getSelectedFolderName(folderSummaries, selectedFolderId),
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
    selectFolder,
    sendNewMessage,
    sendEditedMessage,
  }
}
