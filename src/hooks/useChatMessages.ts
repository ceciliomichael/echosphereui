import { useCallback, useEffect, useRef, useState } from 'react'
import { restoreWorkspaceCheckpointForMessage } from './chatHistoryWorkflows'
import type { ChatRuntimeSelection } from './chatMessageRuntime'
import { useChatComposerState } from './useChatComposerState'
import { useChatConversationActions } from './useChatConversationActions'
import { useChatSendActions } from './useChatSendActions'
import { useChatSessionState } from './useChatSessionState'
import { useChatStreamingState } from './useChatStreamingState'
import { useInitializeChatHistory } from './useInitializeChatHistory'
import type { AppLanguage } from '../lib/appSettings'
import type { ChatMode, Message, RevertEditSession } from '../types/chat'

const EMPTY_MESSAGES: Message[] = []

interface UseChatMessagesInput {
  language: AppLanguage
  preferredConversationId: string | null
  revertEditSessionsByConversation: Record<string, RevertEditSession>
  persistRevertEditSessionsByConversation: (nextValue: Record<string, RevertEditSession>) => void
  shouldInitializeHistory: boolean
}

export function useChatMessages(input: UseChatMessagesInput) {
  const {
    language,
    persistRevertEditSessionsByConversation,
    preferredConversationId,
    revertEditSessionsByConversation: persistedRevertEditSessionsByConversation,
    shouldInitializeHistory,
  } = input
  const sessionState = useChatSessionState(language)
  const messages = sessionState.activeConversationState?.conversation.messages ?? EMPTY_MESSAGES
  const isSending = sessionState.activeConversationState?.isSending ?? false
  const composerState = useChatComposerState(messages)
  const activeConversationId = sessionState.activeConversationId
  const setSessionError = sessionState.setError
  const editingMessageId = composerState.editingMessageId
  const startComposerEditingMessage = composerState.startEditingMessage
  const cancelComposerEditingMessage = composerState.cancelEditingMessage
  const [draftChatMode, setDraftChatMode] = useState<ChatMode>('agent')
  const [pendingDraftSendCount, setPendingDraftSendCount] = useState(0)
  const [revertEditSessionsByConversation, setRevertEditSessionsByConversation] = useState<
    Record<string, RevertEditSession>
  >(persistedRevertEditSessionsByConversation)
  const revertEditSessionsRef = useRef<Record<string, RevertEditSession>>(persistedRevertEditSessionsByConversation)
  const resumeSessionKeyRef = useRef<string | null>(null)
  const syncedConversationModeIdRef = useRef<string | null>(null)

  useEffect(() => {
    revertEditSessionsRef.current = persistedRevertEditSessionsByConversation
    setRevertEditSessionsByConversation(persistedRevertEditSessionsByConversation)
  }, [persistedRevertEditSessionsByConversation])

  const setRevertEditSessions = useCallback(
    (nextValue: Record<string, RevertEditSession>) => {
      revertEditSessionsRef.current = nextValue
      setRevertEditSessionsByConversation(nextValue)
      persistRevertEditSessionsByConversation(nextValue)
    },
    [persistRevertEditSessionsByConversation],
  )

  const clearRevertEditSession = useCallback(
    (conversationId: string) => {
      const currentValue = revertEditSessionsRef.current
      if (!(conversationId in currentValue)) {
        return
      }

      const nextValue = { ...currentValue }
      delete nextValue[conversationId]
      setRevertEditSessions(nextValue)
    },
    [setRevertEditSessions],
  )

  const streamingState = useChatStreamingState({
    activeConversationId: sessionState.activeConversationId,
    conversationRuntimeStates: sessionState.conversationRuntimeStates,
    selectedFolderId: sessionState.selectedFolderId,
    updateConversationRuntimeState: sessionState.updateConversationRuntimeState,
  })

  useInitializeChatHistory({
    enabled: shouldInitializeHistory,
    initializeHistory: sessionState.initializeHistory,
    preferredConversationId,
    setError: sessionState.setError,
    setIsLoading: sessionState.setIsLoading,
  })

  const conversationActions = useChatConversationActions({
    activeConversationId,
    addFolder: sessionState.addFolder,
    applyConversation: sessionState.applyConversation,
    beginEditingMessage: startComposerEditingMessage,
    clearConversationSelection: sessionState.clearConversationSelection,
    clearError: sessionState.clearError,
    conversationRuntimeStatesRef: streamingState.conversationRuntimeStatesRef,
    getDeletionContext: sessionState.getDeletionContext,
    removeFolder: sessionState.removeFolder,
    removeConversationRuntime: sessionState.removeConversationRuntime,
    renameFolder: sessionState.renameFolder,
    replaceConversationSummaries: sessionState.replaceConversationSummaries,
    resetComposerState: composerState.resetComposerState,
    selectedFolderId: sessionState.selectedFolderId,
    setError: sessionState.setError,
    upsertConversation: sessionState.upsertConversation,
  })

  useEffect(() => {
    const activeConversationId = sessionState.activeConversationId
    if (!activeConversationId) {
      syncedConversationModeIdRef.current = null
      return
    }

    if (syncedConversationModeIdRef.current === activeConversationId) {
      return
    }

    syncedConversationModeIdRef.current = activeConversationId
    const activeConversationChatMode = sessionState.activeConversationChatMode
    if (!activeConversationChatMode) {
      return
    }

    setDraftChatMode(activeConversationChatMode)
  }, [sessionState.activeConversationChatMode, sessionState.activeConversationId])

  const beginRevertEditingMessage = useCallback(
    (conversationId: string, messageId: string, redoCheckpointId: string) => {
      const currentValue = revertEditSessionsRef.current
      const existingSession = currentValue[conversationId]
      if (
        !existingSession ||
        existingSession.messageId !== messageId ||
        existingSession.redoCheckpointId !== redoCheckpointId
      ) {
        setRevertEditSessions({
          ...currentValue,
          [conversationId]: {
            messageId,
            redoCheckpointId,
          },
        })
      }

      startComposerEditingMessage(messageId)
    },
    [setRevertEditSessions, startComposerEditingMessage],
  )

  const completeEditingMessage = useCallback(() => {
    cancelComposerEditingMessage()
    if (activeConversationId) {
      clearRevertEditSession(activeConversationId)
    }
  }, [activeConversationId, cancelComposerEditingMessage, clearRevertEditSession])

  const redoRevertSession = useCallback(
    async (_conversationId: string, revertSession: RevertEditSession, failureMessage: string) => {
      await window.echosphereWorkspace.restoreCheckpoint(revertSession.redoCheckpointId).catch((caughtError) => {
        console.error(caughtError)
        throw new Error(failureMessage)
      })
    },
    [],
  )

  const cancelEditingMessage = useCallback(async () => {
    const activeEditingMessageId = editingMessageId
    cancelComposerEditingMessage()

    if (!activeConversationId || !activeEditingMessageId) {
      return
    }

    const revertSession = revertEditSessionsRef.current[activeConversationId]
    if (!revertSession || revertSession.messageId !== activeEditingMessageId) {
      return
    }

    clearRevertEditSession(activeConversationId)
    try {
      await redoRevertSession(activeConversationId, revertSession, 'Unable to redo reverted workspace changes.')
    } catch (caughtError) {
      setSessionError(
        caughtError instanceof Error && caughtError.message.trim().length > 0
          ? caughtError.message
          : 'Unable to redo reverted workspace changes.',
      )
    }
  }, [
    activeConversationId,
    cancelComposerEditingMessage,
    clearRevertEditSession,
    editingMessageId,
    redoRevertSession,
    setSessionError,
  ])

  useEffect(() => {
    if (!activeConversationId) {
      resumeSessionKeyRef.current = null
      return
    }

    const activeRevertSession = revertEditSessionsByConversation[activeConversationId]
    if (!activeRevertSession) {
      resumeSessionKeyRef.current = null
      return
    }

    if (editingMessageId === activeRevertSession.messageId) {
      return
    }

    const resumeSessionKey = `${activeConversationId}:${activeRevertSession.messageId}:${activeRevertSession.redoCheckpointId}`
    if (resumeSessionKeyRef.current === resumeSessionKey) {
      return
    }

    resumeSessionKeyRef.current = resumeSessionKey
    let isDisposed = false

    void restoreWorkspaceCheckpointForMessage(activeConversationId, activeRevertSession.messageId)
      .then(() => {
        if (isDisposed) {
          return
        }

        startComposerEditingMessage(activeRevertSession.messageId)
      })
      .catch((caughtError) => {
        console.error(caughtError)
        if (isDisposed) {
          return
        }

        clearRevertEditSession(activeConversationId)
        setSessionError('Unable to resume reverted edit mode for this thread.')
      })

    return () => {
      isDisposed = true
    }
  }, [
    clearRevertEditSession,
    activeConversationId,
    editingMessageId,
    revertEditSessionsByConversation,
    setSessionError,
    startComposerEditingMessage,
  ])

  const startEditingMessage = useCallback(
    async (messageId: string) => {
      if (activeConversationId) {
        const activeRevertSession = revertEditSessionsRef.current[activeConversationId]
        if (activeRevertSession) {
          try {
            await redoRevertSession(
              activeConversationId,
              activeRevertSession,
              'Unable to redo reverted workspace changes before editing that message.',
            )
          } catch (caughtError) {
            clearRevertEditSession(activeConversationId)
            setSessionError(
              caughtError instanceof Error && caughtError.message.trim().length > 0
                ? caughtError.message
                : 'Unable to redo reverted workspace changes before editing that message.',
            )
            return
          }

          clearRevertEditSession(activeConversationId)
        }
      }

      conversationActions.startEditingMessage(messageId)
    },
    [activeConversationId, clearRevertEditSession, conversationActions, redoRevertSession, setSessionError],
  )

  useEffect(() => {
    if (!editingMessageId) {
      return
    }

    const editingMessageExists = messages.some((message) => message.id === editingMessageId && message.role === 'user')
    if (editingMessageExists) {
      return
    }

    cancelComposerEditingMessage()
    if (activeConversationId) {
      const activeRevertSession = revertEditSessionsRef.current[activeConversationId]
      if (activeRevertSession?.messageId === editingMessageId) {
        clearRevertEditSession(activeConversationId)
      }
    }
  }, [activeConversationId, cancelComposerEditingMessage, clearRevertEditSession, editingMessageId, messages])

  const sendActions = useChatSendActions({
    activeConversationId,
    activeConversationIdRef: streamingState.activeConversationIdRef,
    activeConversationStateIsSending: isSending,
    applyConversation: sessionState.applyConversation,
    appendLocalMessage: sessionState.appendLocalMessage,
    beginRevertEditingMessage,
    cancelEditingMessage,
    clearError: sessionState.clearError,
    clearTextStreamingIdleTimeout: streamingState.clearTextStreamingIdleTimeout,
    completeEditingMessage,
    conversationRuntimeStatesRef: streamingState.conversationRuntimeStatesRef,
    draftChatMode,
    editComposerAttachments: composerState.editComposerAttachments,
    editComposerValue: composerState.editComposerValue,
    editingMessageId,
    mainComposerAttachments: composerState.mainComposerAttachments,
    mainComposerValue: composerState.mainComposerValue,
    markTextStreamingPulse: streamingState.markTextStreamingPulse,
    pendingDraftSendCount,
    removeLocalMessage: sessionState.removeLocalMessage,
    selectedFolderId: sessionState.selectedFolderId,
    selectedFolderIdRef: streamingState.selectedFolderIdRef,
    setError: sessionState.setError,
    setMainComposerAttachments: composerState.setMainComposerAttachments,
    setMainComposerValue: composerState.setMainComposerValue,
    setPendingDraftSendCount,
    stopTextStreaming: streamingState.stopTextStreaming,
    updateConversationRuntimeState: sessionState.updateConversationRuntimeState,
    updateConversationSummary: sessionState.updateConversationSummary,
    updateLocalMessage: sessionState.updateLocalMessage,
    upsertConversation: sessionState.upsertConversation,
  })

  const isActiveDraftSending = activeConversationId === null && pendingDraftSendCount > 0

  return {
    activeConversationId,
    activeConversationRootPath: sessionState.activeConversationState?.conversation.agentContextRootPath ?? null,
    activeConversationTitle: sessionState.activeConversationTitle,
    cancelEditingMessage,
    conversationGroups: sessionState.conversationGroups,
    createConversation: conversationActions.createConversation,
    createFolder: conversationActions.createFolder,
    deleteFolder: conversationActions.deleteFolder,
    deleteConversation: conversationActions.deleteConversation,
    editComposerAttachments: composerState.editComposerAttachments,
    editComposerFocusSignal: composerState.editComposerFocusSignal,
    editComposerMentionPathMap: composerState.editComposerMentionPathMap,
    editComposerValue: composerState.editComposerValue,
    editingMessageId,
    error: sessionState.error,
    isEditingMessage: editingMessageId !== null,
    isEditComposerDirty: composerState.isEditComposerDirty,
    isLoading: sessionState.isLoading,
    isSending: sessionState.activeConversationState?.isSending ?? isActiveDraftSending,
    isStreamingResponse: sessionState.activeConversationState?.isSending ?? isActiveDraftSending,
    isStreamingTextActive: sessionState.activeConversationState?.isStreamingTextActive ?? false,
    mainComposerAttachments: composerState.mainComposerAttachments,
    mainComposerValue: composerState.mainComposerValue,
    messages,
    selectedChatMode: draftChatMode,
    selectedFolderId: sessionState.selectedFolderId,
    selectedFolderName: sessionState.selectedFolderName,
    selectedFolderPath: sessionState.selectedFolderPath,
    selectConversation: conversationActions.selectConversation,
    selectFolder: conversationActions.selectFolder,
    renameConversationTitle: conversationActions.renameConversationTitle,
    renameFolder: conversationActions.renameFolder,
    setEditComposerAttachments: composerState.setEditComposerAttachments,
    setEditComposerValue: composerState.setEditComposerValue,
    setMainComposerAttachments: composerState.setMainComposerAttachments,
    setMainComposerValue: composerState.setMainComposerValue,
    setSelectedChatMode: setDraftChatMode,
    startEditingMessage,
    streamingAssistantMessageId: sessionState.activeConversationState?.streamingAssistantMessageId ?? null,
    streamingWaitingIndicatorVariant: sessionState.activeConversationState?.streamingWaitingIndicatorVariant ?? null,
    abortStreamingResponse: sendActions.abortStreamingResponse,
    revertUserMessage: sendActions.revertUserMessage,
    sendEditedMessage: sendActions.sendEditedMessage,
    sendNewMessage: sendActions.sendNewMessage,
    sendProgrammaticMessage: sendActions.sendProgrammaticMessage,
  }
}

export type ChatMessagesController = ReturnType<typeof useChatMessages>
export type { ChatRuntimeSelection }
