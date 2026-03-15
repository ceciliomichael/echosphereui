import { useCallback } from 'react'
import type { ConversationFolderSummary, ConversationRecord, ConversationSummary } from '../types/chat'
import type { ConversationRuntimeSnapshot } from './chatMessageSendTypes'

interface UseChatConversationActionsInput {
  activeConversationId: string | null
  addFolder: (folder: ConversationFolderSummary) => void
  applyConversation: (conversation: ConversationRecord) => void
  beginEditingMessage: (messageId: string) => void
  clearConversationSelection: (nextFolderId: string | null) => void
  clearError: () => void
  conversationRuntimeStatesRef: { current: Record<string, ConversationRuntimeSnapshot> }
  getDeletionContext: (conversationId: string) => {
    deletedConversationFolderId: string | null
    remainingSummaries: ConversationSummary[]
  }
  removeFolder: (folderId: string, deletedConversationIds: readonly string[]) => void
  removeConversationRuntime: (conversationId: string) => void
  renameFolder: (folderId: string, name: string) => void
  replaceConversationSummaries: (summaries: ConversationSummary[]) => void
  resetComposerState: () => void
  selectedFolderId: string | null
  setError: (errorMessage: string | null) => void
  upsertConversation: (conversation: ConversationRecord) => void
}

export function useChatConversationActions(input: UseChatConversationActionsInput) {
  const {
    activeConversationId,
    addFolder,
    applyConversation,
    beginEditingMessage,
    clearConversationSelection,
    clearError,
    conversationRuntimeStatesRef,
    getDeletionContext,
    removeFolder,
    removeConversationRuntime,
    renameFolder,
    replaceConversationSummaries,
    resetComposerState,
    selectedFolderId,
    setError,
    upsertConversation,
  } = input

  const resetDraft = useCallback(
    (nextFolderId: string | null) => {
      resetComposerState()
      clearConversationSelection(nextFolderId)
    },
    [clearConversationSelection, resetComposerState],
  )

  const createConversation = useCallback(
    (folderId = selectedFolderId) => {
      clearError()
      resetDraft(folderId)
    },
    [clearError, resetDraft, selectedFolderId],
  )

  const createFolder = useCallback(async () => {
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
  }, [addFolder, clearError, resetDraft, setError])

  const selectFolder = useCallback(
    (folderId: string | null) => {
      clearError()
      resetDraft(folderId)
    },
    [clearError, resetDraft],
  )

  const selectConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === activeConversationId) {
        return
      }

      clearError()
      resetComposerState()

      const cachedConversation = conversationRuntimeStatesRef.current[conversationId]?.conversation
      if (cachedConversation) {
        applyConversation(cachedConversation)
        return
      }

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
    },
    [activeConversationId, applyConversation, clearError, conversationRuntimeStatesRef, resetComposerState, setError],
  )

  const startEditingMessage = useCallback(
    (messageId: string) => {
      clearError()
      beginEditingMessage(messageId)
    },
    [beginEditingMessage, clearError],
  )

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      clearError()

      const conversationState = conversationRuntimeStatesRef.current[conversationId] ?? null
      if (conversationState?.isSending && conversationState.activeStreamId === null) {
        setError('Wait for the current thread task to initialize before deleting it.')
        return
      }

      if (conversationState?.activeStreamId) {
        try {
          await window.echosphereChat.cancelStream(conversationState.activeStreamId)
        } catch (caughtError) {
          console.error(caughtError)
          setError('Unable to stop the current thread task before deleting it.')
          return
        }
      }

      const { deletedConversationFolderId, remainingSummaries } = getDeletionContext(conversationId)

      if (conversationId === activeConversationId) {
        resetComposerState()
      }

      try {
        await window.echosphereHistory.deleteConversation(conversationId)
        removeConversationRuntime(conversationId)
        replaceConversationSummaries(remainingSummaries)

        if (remainingSummaries.length === 0) {
          clearConversationSelection(deletedConversationFolderId)
          return
        }

        if (conversationId !== activeConversationId) {
          return
        }

        clearConversationSelection(deletedConversationFolderId)

        const cachedConversation = conversationRuntimeStatesRef.current[remainingSummaries[0].id]?.conversation
        if (cachedConversation) {
          applyConversation(cachedConversation)
          return
        }

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
    },
    [
      activeConversationId,
      applyConversation,
      clearConversationSelection,
      clearError,
      conversationRuntimeStatesRef,
      getDeletionContext,
      removeConversationRuntime,
      replaceConversationSummaries,
      resetComposerState,
      setError,
    ],
  )

  return {
    createConversation,
    createFolder,
    deleteConversation,
    renameConversationTitle: async (conversationId: string, title: string) => {
      clearError()

      try {
        const conversation = await window.echosphereHistory.updateConversationTitle(conversationId, title)
        upsertConversation(conversation)
        if (conversationId === activeConversationId) {
          applyConversation(conversation)
        }
      } catch (caughtError) {
        console.error(caughtError)
        setError('Unable to rename that thread.')
        throw caughtError
      }
    },
    renameFolder: async (folderId: string, name: string) => {
      clearError()

      try {
        const folder = await window.echosphereHistory.renameFolder({
          folderId,
          name,
        })
        renameFolder(folder.id, folder.name)
      } catch (caughtError) {
        console.error(caughtError)
        setError('Unable to rename that project folder.')
        throw caughtError
      }
    },
    deleteFolder: async (folderId: string) => {
      clearError()

      try {
        const deletedConversationIds = await window.echosphereHistory.deleteFolder(folderId)
        removeFolder(folderId, deletedConversationIds)
      } catch (caughtError) {
        console.error(caughtError)
        setError('Unable to remove that project folder.')
        throw caughtError
      }
    },
    selectConversation,
    selectFolder,
    startEditingMessage,
  }
}
