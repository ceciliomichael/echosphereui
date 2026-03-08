import { useEffect } from 'react'
import { loadInitialChatHistory, persistConversationTurn } from './chatHistoryWorkflows'
import { useChatComposerState } from './useChatComposerState'
import { useChatSessionState } from './useChatSessionState'

export function useChatMessages() {
  const {
    activeConversationId,
    activeConversationTitle,
    addFolder,
    applyConversation,
    applySavedConversation,
    clearConversationSelection,
    clearError,
    conversationGroups,
    error,
    getDeletionContext,
    initializeHistory,
    isLoading,
    isSending,
    messages,
    replaceConversationSummaries,
    selectedFolderId,
    selectedFolderName,
    setError,
    setIsLoading,
    setIsSending,
  } = useChatSessionState()
  const {
    mainComposerValue,
    setMainComposerValue,
    editComposerValue,
    setEditComposerValue,
    editingMessageId,
    editComposerFocusSignal,
    resetComposerState,
    startEditingMessage: beginEditingMessage,
    cancelEditingMessage,
  } = useChatComposerState(messages, isSending)

  function resetDraft(nextFolderId: string | null) {
    resetComposerState()
    clearConversationSelection(nextFolderId)
  }

  useEffect(() => {
    let isMounted = true

    async function initializeConversations() {
      try {
        const { conversationSummaries: summaries, folderSummaries: folders, initialConversation } =
          await loadInitialChatHistory()

        if (!isMounted) {
          return
        }

        initializeHistory({ conversationSummaries: summaries, folderSummaries: folders, initialConversation })
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
  }, [initializeHistory, setError, setIsLoading])

  function createConversation(folderId = selectedFolderId) {
    clearError()
    resetDraft(folderId)
  }

  async function createFolder() {
    clearError()

    try {
      const folder = await window.echosphereHistory.pickFolder()
      if (!folder) {
        return
      }

      addFolder(folder)
      resetDraft(folder.id)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to create that folder.')
      throw caughtError
    }
  }

  function selectFolder(folderId: string | null) {
    clearError()
    resetDraft(folderId)
  }

  async function selectConversation(conversationId: string) {
    if (conversationId === activeConversationId) {
      return
    }

    clearError()
    resetComposerState()

    try {
      const conversation = await window.echosphereHistory.getConversation(conversationId)
      if (!conversation) {
        setError('That conversation could not be loaded.')
        return
      }

      applyConversation(conversation)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to switch conversations.')
    }
  }

  function startEditingMessage(messageId: string) {
    clearError()
    beginEditingMessage(messageId)
  }

  async function persistMessageTurn(trimmedText: string, targetEditMessageId: string | null) {
    clearError()
    setIsSending(true)

    try {
      const savedConversation = await persistConversationTurn({
        activeConversationId,
        selectedFolderId,
        targetEditMessageId,
        trimmedText,
      })

      applySavedConversation(savedConversation)

      if (targetEditMessageId !== null) {
        cancelEditingMessage()
      } else {
        setMainComposerValue('')
      }
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
    clearError()
    const { deletedConversationFolderId, remainingSummaries } = getDeletionContext(conversationId)

    if (conversationId === activeConversationId) {
      resetComposerState()
    }

    try {
      await window.echosphereHistory.deleteConversation(conversationId)
      replaceConversationSummaries(remainingSummaries)

      if (remainingSummaries.length === 0) {
        clearConversationSelection(deletedConversationFolderId)
        return
      }

      if (conversationId !== activeConversationId) {
        return
      }

      clearConversationSelection(deletedConversationFolderId)

      const nextConversation = await window.echosphereHistory.getConversation(remainingSummaries[0].id)
      if (!nextConversation) {
        setError('Unable to load the next conversation after deletion.')
        return
      }

      applyConversation(nextConversation)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to delete that conversation.')
    }
  }

  return {
    activeConversationTitle,
    conversationGroups,
    createConversation,
    createFolder,
    error,
    selectedFolderName,
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
