import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { loadInitialChatHistory, persistAssistantMessage, persistUserTurn } from './chatHistoryWorkflows'
import { useChatComposerState } from './useChatComposerState'
import { useChatSessionState } from './useChatSessionState'
import type { AppLanguage } from '../lib/appSettings'
import type { ChatProviderId, Message, ReasoningEffort } from '../types/chat'

interface ChatRuntimeSelection {
  isCodexAuthenticated: boolean
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
}

interface StreamAssistantResponseInput {
  messages: Message[]
  modelId: string
  onContentDelta: (delta: string) => void
  onReasoningCompleted: (completedAt: number) => void
  onReasoningDelta: (delta: string) => void
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
}

interface StreamAssistantResponseOutput {
  content: string
  reasoningCompletedAt: number | null
  reasoningContent: string
}

function normalizeMarkdownText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallbackMessage
}

async function streamAssistantResponse(input: StreamAssistantResponseInput): Promise<StreamAssistantResponseOutput> {
  let streamId: string | null = null
  let assistantContent = ''
  let reasoningCompletedAt: number | null = null
  let reasoningContent = ''

  return new Promise<StreamAssistantResponseOutput>((resolve, reject) => {
    const unsubscribe = window.echosphereChat.onStreamEvent((event) => {
      if (!streamId || event.streamId !== streamId) {
        return
      }

      if (event.type === 'content_delta') {
        if (reasoningCompletedAt === null && reasoningContent.trim().length > 0) {
          reasoningCompletedAt = Date.now()
          input.onReasoningCompleted(reasoningCompletedAt)
        }

        assistantContent += event.delta
        input.onContentDelta(event.delta)
        return
      }

      if (event.type === 'reasoning_delta') {
        reasoningContent += event.delta
        input.onReasoningDelta(event.delta)
        return
      }

      if (event.type === 'completed') {
        if (reasoningCompletedAt === null && reasoningContent.trim().length > 0) {
          reasoningCompletedAt = Date.now()
          input.onReasoningCompleted(reasoningCompletedAt)
        }

        unsubscribe()
        resolve({
          content: assistantContent,
          reasoningCompletedAt,
          reasoningContent,
        })
        return
      }

      if (event.type === 'error') {
        unsubscribe()
        reject(new Error(event.errorMessage))
      }
    })

    void window.echosphereChat
      .startStream({
        messages: input.messages,
        modelId: input.modelId,
        providerId: input.providerId,
        reasoningEffort: input.reasoningEffort,
      })
      .then((result) => {
        streamId = result.streamId
      })
      .catch((error) => {
        unsubscribe()
        reject(error)
      })
  })
}

export function useChatMessages(language: AppLanguage, runtimeSelection: ChatRuntimeSelection) {
  const {
    activeConversationId,
    activeConversationTitle,
    addFolder,
    appendLocalMessage,
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
    removeLocalMessage,
    replaceConversationSummaries,
    selectedFolderId,
    selectedFolderName,
    setError,
    setIsLoading,
    setIsSending,
    updateLocalMessage,
  } = useChatSessionState(language)
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
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(null)

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

  async function persistAndStreamMessage(trimmedText: string, targetEditMessageId: string | null) {
    if (!runtimeSelection.isCodexAuthenticated) {
      setError('Codex is not connected. Connect Codex in Settings before sending messages.')
      return
    }

    if (runtimeSelection.modelId.trim().length === 0) {
      setError('Select a Codex model before sending your message.')
      return
    }

    clearError()
    setIsSending(true)

    const draftAssistantId = uuidv4()
    const assistantStartedAt = Date.now()
    let didAppendDraftAssistant = false

    try {
      const { conversation } = await persistUserTurn({
        activeConversationId,
        modelId: runtimeSelection.modelId,
        providerId: runtimeSelection.providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
        selectedFolderId,
        targetEditMessageId,
        trimmedText,
      })

      applySavedConversation(conversation)

      if (targetEditMessageId !== null) {
        cancelEditingMessage()
      } else {
        setMainComposerValue('')
      }

      appendLocalMessage({
        content: '',
        id: draftAssistantId,
        modelId: runtimeSelection.modelId,
        providerId: runtimeSelection.providerId,
        reasoningContent: '',
        reasoningCompletedAt: undefined,
        reasoningEffort: runtimeSelection.reasoningEffort,
        role: 'assistant',
        timestamp: assistantStartedAt,
      })
      didAppendDraftAssistant = true
      setStreamingAssistantMessageId(draftAssistantId)
      const streamedAssistant = await streamAssistantResponse({
        messages: conversation.messages,
        modelId: runtimeSelection.modelId,
        onContentDelta: (delta) => {
          updateLocalMessage(draftAssistantId, (message) => ({
            ...message,
            content: message.content + delta,
          }))
        },
        onReasoningCompleted: (completedAt) => {
          updateLocalMessage(draftAssistantId, (message) => ({
            ...message,
            reasoningCompletedAt: message.reasoningCompletedAt ?? completedAt,
          }))
        },
        onReasoningDelta: (delta) => {
          updateLocalMessage(draftAssistantId, (message) => ({
            ...message,
            reasoningContent: (message.reasoningContent ?? '') + delta,
          }))
        },
        providerId: runtimeSelection.providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
      })

      removeLocalMessage(draftAssistantId)
      didAppendDraftAssistant = false
      setStreamingAssistantMessageId(null)
      const assistantMessage: Message = {
        content: normalizeMarkdownText(streamedAssistant.content),
        id: draftAssistantId,
        modelId: runtimeSelection.modelId,
        providerId: runtimeSelection.providerId,
        reasoningCompletedAt: streamedAssistant.reasoningCompletedAt ?? undefined,
        reasoningContent: normalizeMarkdownText(streamedAssistant.reasoningContent),
        reasoningEffort: runtimeSelection.reasoningEffort,
        role: 'assistant',
        timestamp: assistantStartedAt,
      }

      if (assistantMessage.content.trim().length === 0 && (assistantMessage.reasoningContent ?? '').trim().length === 0) {
        throw new Error('The assistant returned an empty response.')
      }

      const savedConversation = await persistAssistantMessage(conversation.id, assistantMessage)
      applySavedConversation(savedConversation)
    } catch (caughtError) {
      console.error(caughtError)
      if (didAppendDraftAssistant) {
        removeLocalMessage(draftAssistantId)
      }

      setError(toErrorMessage(caughtError, 'Unable to get a response from Codex right now.'))
    } finally {
      setStreamingAssistantMessageId(null)
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

    await persistAndStreamMessage(trimmedText, null)
  }

  async function sendEditedMessage() {
    if (isSending || editingMessageId === null) {
      return
    }

    const trimmedText = editComposerValue.trim()
    if (trimmedText.length === 0) {
      return
    }

    await persistAndStreamMessage(trimmedText, editingMessageId)
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
    activeConversationId,
    activeConversationTitle,
    cancelEditingMessage,
    conversationGroups,
    createConversation,
    createFolder,
    deleteConversation,
    editComposerFocusSignal,
    editComposerValue,
    editingMessageId,
    error,
    isEditingMessage: editingMessageId !== null,
    isLoading,
    isSending,
    mainComposerValue,
    messages,
    selectConversation,
    selectFolder,
    selectedFolderName,
    sendEditedMessage,
    sendNewMessage,
    streamingAssistantMessageId,
    setEditComposerValue,
    setMainComposerValue,
    startEditingMessage,
  }
}
