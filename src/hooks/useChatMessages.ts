import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { loadInitialChatHistory, persistAssistantTurn, persistUserTurn } from './chatHistoryWorkflows'
import { useChatComposerState } from './useChatComposerState'
import { useChatSessionState } from './useChatSessionState'
import type { AppLanguage } from '../lib/appSettings'
import type { ChatProviderId, Message, ReasoningEffort, ToolInvocationTrace } from '../types/chat'

interface ChatRuntimeSelection {
  hasConfiguredProvider: boolean
  modelId: string
  providerId: ChatProviderId | null
  providerLabel: string | null
  reasoningEffort: ReasoningEffort
}

interface StreamAssistantResponseInput {
  messages: Message[]
  modelId: string
  onContentDelta: (delta: string) => void
  onReasoningCompleted: (completedAt: number) => void
  onReasoningDelta: (delta: string) => void
  onStreamStarted: (streamId: string) => void
  onSyntheticToolMessage: (message: Message) => void
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
  onToolInvocationCompleted: (
    invocationId: string,
    nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'toolName'>,
  ) => void
  onToolInvocationFailed: (
    invocationId: string,
    nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'toolName'>,
  ) => void
  onToolInvocationStarted: (
    invocationId: string,
    nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName'>,
  ) => void
}

interface StreamAssistantResponseOutput {
  content: string
  reasoningCompletedAt: number | null
  reasoningContent: string
  syntheticToolMessages: Message[]
  toolInvocations: ToolInvocationTrace[]
  wasAborted: boolean
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

function upsertToolInvocation(
  toolInvocations: ToolInvocationTrace[],
  invocationId: string,
  updater: (currentValue: ToolInvocationTrace | null) => ToolInvocationTrace,
) {
  const existingInvocation = toolInvocations.find((invocation) => invocation.id === invocationId) ?? null
  const nextInvocation = updater(existingInvocation)

  if (!existingInvocation) {
    return [...toolInvocations, nextInvocation]
  }

  return toolInvocations.map((invocation) => (invocation.id === invocationId ? nextInvocation : invocation))
}

async function streamAssistantResponse(input: StreamAssistantResponseInput): Promise<StreamAssistantResponseOutput> {
  let streamId: string | null = null
  let assistantContent = ''
  let reasoningCompletedAt: number | null = null
  let reasoningContent = ''
  let toolInvocations: ToolInvocationTrace[] = []
  const syntheticToolMessages: Message[] = []

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

      if (event.type === 'tool_invocation_started') {
        toolInvocations = upsertToolInvocation(toolInvocations, event.invocationId, (currentValue) => ({
          argumentsText: event.argumentsText,
          id: event.invocationId,
          resultContent: currentValue?.resultContent,
          startedAt: currentValue?.startedAt ?? event.startedAt,
          state: 'running',
          toolName: event.toolName,
        }))

        input.onToolInvocationStarted(event.invocationId, {
          argumentsText: event.argumentsText,
          startedAt: event.startedAt,
          toolName: event.toolName,
        })
        return
      }

      if (event.type === 'tool_invocation_completed') {
        toolInvocations = upsertToolInvocation(toolInvocations, event.invocationId, (currentValue) => ({
          argumentsText: event.argumentsText,
          completedAt: event.completedAt,
          id: event.invocationId,
          resultContent: event.resultContent,
          startedAt: currentValue?.startedAt ?? event.completedAt,
          state: 'completed',
          toolName: event.toolName,
        }))

        syntheticToolMessages.push(event.syntheticMessage)
        input.onSyntheticToolMessage(event.syntheticMessage)
        input.onToolInvocationCompleted(event.invocationId, {
          argumentsText: event.argumentsText,
          completedAt: event.completedAt,
          resultContent: event.resultContent,
          toolName: event.toolName,
        })
        return
      }

      if (event.type === 'tool_invocation_failed') {
        toolInvocations = upsertToolInvocation(toolInvocations, event.invocationId, (currentValue) => ({
          argumentsText: event.argumentsText,
          completedAt: event.completedAt,
          id: event.invocationId,
          resultContent: event.resultContent,
          startedAt: currentValue?.startedAt ?? event.completedAt,
          state: 'failed',
          toolName: event.toolName,
        }))

        syntheticToolMessages.push(event.syntheticMessage)
        input.onSyntheticToolMessage(event.syntheticMessage)
        input.onToolInvocationFailed(event.invocationId, {
          argumentsText: event.argumentsText,
          completedAt: event.completedAt,
          resultContent: event.resultContent,
          toolName: event.toolName,
        })
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
          syntheticToolMessages,
          toolInvocations,
          wasAborted: false,
        })
        return
      }

      if (event.type === 'aborted') {
        if (reasoningCompletedAt === null && reasoningContent.trim().length > 0) {
          reasoningCompletedAt = Date.now()
          input.onReasoningCompleted(reasoningCompletedAt)
        }

        unsubscribe()
        resolve({
          content: assistantContent,
          reasoningCompletedAt,
          reasoningContent,
          syntheticToolMessages,
          toolInvocations,
          wasAborted: true,
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
        input.onStreamStarted(result.streamId)
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
    insertLocalMessagesBefore,
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
    updateConversationSummary,
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
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const activeStreamIdRef = useRef<string | null>(null)

  const updateActiveStreamId = useCallback((streamId: string | null) => {
    activeStreamIdRef.current = streamId
    setActiveStreamId(streamId)
  }, [])

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

  const startEditingMessage = useCallback((messageId: string) => {
    clearError()
    beginEditingMessage(messageId)
  }, [beginEditingMessage, clearError])

  async function persistAndStreamMessage(trimmedText: string, targetEditMessageId: string | null) {
    if (!runtimeSelection.hasConfiguredProvider) {
      setError('No provider is configured. Configure a provider in Settings before sending messages.')
      return
    }

    if (!runtimeSelection.providerId) {
      setError('Select a configured model before sending your message.')
      return
    }

    if (runtimeSelection.modelId.trim().length === 0) {
      const providerLabel = runtimeSelection.providerLabel ?? 'provider'
      setError(`Select a ${providerLabel} model before sending your message.`)
      return
    }

    const providerId = runtimeSelection.providerId
    clearError()
    setIsSending(true)

    const draftAssistantId = uuidv4()
    const assistantStartedAt = Date.now()
    let didAppendDraftAssistant = false
    const insertedSyntheticToolMessageIds: string[] = []

    try {
      const { conversation } = await persistUserTurn({
        activeConversationId,
        modelId: runtimeSelection.modelId,
        providerId,
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
        providerId,
        reasoningContent: '',
        reasoningCompletedAt: undefined,
        reasoningEffort: runtimeSelection.reasoningEffort,
        role: 'assistant',
        timestamp: assistantStartedAt,
        toolInvocations: [],
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
        onSyntheticToolMessage: (syntheticMessage) => {
          insertedSyntheticToolMessageIds.push(syntheticMessage.id)
          insertLocalMessagesBefore(draftAssistantId, [syntheticMessage])
        },
        onStreamStarted: updateActiveStreamId,
        onToolInvocationCompleted: (invocationId, nextValue) => {
          updateLocalMessage(draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              completedAt: nextValue.completedAt,
              id: invocationId,
              resultContent: nextValue.resultContent,
              startedAt: currentValue?.startedAt ?? nextValue.completedAt ?? assistantStartedAt,
              state: 'completed',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationFailed: (invocationId, nextValue) => {
          updateLocalMessage(draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              completedAt: nextValue.completedAt,
              id: invocationId,
              resultContent: nextValue.resultContent,
              startedAt: currentValue?.startedAt ?? nextValue.completedAt ?? assistantStartedAt,
              state: 'failed',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationStarted: (invocationId, nextValue) => {
          updateLocalMessage(draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              id: invocationId,
              resultContent: currentValue?.resultContent,
              startedAt: currentValue?.startedAt ?? nextValue.startedAt,
              state: 'running',
              toolName: nextValue.toolName,
            })),
          }))
        },
        providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
      })

      updateActiveStreamId(null)

      const assistantMessage: Message = {
        content: normalizeMarkdownText(streamedAssistant.content),
        id: draftAssistantId,
        modelId: runtimeSelection.modelId,
        providerId,
        reasoningCompletedAt: streamedAssistant.reasoningCompletedAt ?? undefined,
        reasoningContent: normalizeMarkdownText(streamedAssistant.reasoningContent),
        reasoningEffort: runtimeSelection.reasoningEffort,
        role: 'assistant',
        timestamp: assistantStartedAt,
        toolInvocations: streamedAssistant.toolInvocations,
      }

      if (assistantMessage.content.trim().length === 0 && (assistantMessage.reasoningContent ?? '').trim().length === 0) {
        if (streamedAssistant.wasAborted) {
          removeLocalMessage(draftAssistantId)
          for (const syntheticMessage of streamedAssistant.syntheticToolMessages) {
            removeLocalMessage(syntheticMessage.id)
          }
          didAppendDraftAssistant = false
          return
        }

        throw new Error('The assistant returned an empty response.')
      }

      updateLocalMessage(draftAssistantId, () => assistantMessage)
      setStreamingAssistantMessageId(null)
      const savedConversation = await persistAssistantTurn(conversation.id, [
        ...streamedAssistant.syntheticToolMessages,
        assistantMessage,
      ])
      didAppendDraftAssistant = false
      updateConversationSummary(savedConversation)
    } catch (caughtError) {
      console.error(caughtError)
      if (didAppendDraftAssistant) {
        removeLocalMessage(draftAssistantId)
      }
      for (const syntheticMessageId of insertedSyntheticToolMessageIds) {
        removeLocalMessage(syntheticMessageId)
      }

      const providerLabel = runtimeSelection.providerLabel ?? 'the selected provider'
      setError(toErrorMessage(caughtError, `Unable to get a response from ${providerLabel} right now.`))
    } finally {
      updateActiveStreamId(null)
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

  const abortStreamingResponse = useCallback(async () => {
    const streamId = activeStreamIdRef.current
    if (!streamId) {
      return
    }

    try {
      await window.echosphereChat.cancelStream(streamId)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to stop the current response.')
    }
  }, [setError])

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
    isStreamingResponse: activeStreamId !== null,
    mainComposerValue,
    messages,
    selectConversation,
    selectFolder,
    selectedFolderName,
    abortStreamingResponse,
    sendEditedMessage,
    sendNewMessage,
    streamingAssistantMessageId,
    setEditComposerValue,
    setMainComposerValue,
    startEditingMessage,
  }
}
