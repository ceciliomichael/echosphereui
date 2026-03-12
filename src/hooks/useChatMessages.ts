import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { loadInitialChatHistory, persistAssistantTurn, persistUserTurn } from './chatHistoryWorkflows'
import { useChatComposerState } from './useChatComposerState'
import { useChatSessionState } from './useChatSessionState'
import type { AppLanguage } from '../lib/appSettings'
import type {
  AssistantWaitingIndicatorVariant,
  ChatMode,
  ChatProviderId,
  Message,
  ReasoningEffort,
  ToolInvocationTrace,
} from '../types/chat'

interface ChatRuntimeSelection {
  hasConfiguredProvider: boolean
  modelId: string
  providerId: ChatProviderId | null
  providerLabel: string | null
  reasoningEffort: ReasoningEffort
}

interface StreamAssistantResponseInput {
  agentContextRootPath: string
  chatMode: ChatMode
  messages: Message[]
  modelId: string
  onContentDelta: (delta: string) => void
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
  onToolInvocationDelta: (
    invocationId: string,
    nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'toolName'>,
  ) => void
}

interface StreamAssistantResponseOutput {
  wasAborted: boolean
}

type DraftAssistantMessageKind = 'placeholder' | 'content' | 'tool'

type StreamedMessageOrderEntry =
  | {
      id: string
      kind: 'assistant'
    }
  | {
      kind: 'message'
      message: Message
    }

const TEXT_STREAM_IDLE_GRACE_MS = 1500

function normalizeMarkdownText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
}

function hasMeaningfulAssistantOutput(message: Message) {
  return (
    message.role === 'assistant' &&
    (message.content.trim().length > 0 ||
      (message.reasoningContent ?? '').trim().length > 0 ||
      (message.toolInvocations?.length ?? 0) > 0)
  )
}

function normalizeAssistantMessage(message: Message): Message {
  if (message.role !== 'assistant') {
    return message
  }

  return {
    ...message,
    content: normalizeMarkdownText(message.content),
    reasoningContent:
      message.reasoningContent === undefined ? undefined : normalizeMarkdownText(message.reasoningContent),
  }
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

  return new Promise<StreamAssistantResponseOutput>((resolve, reject) => {
    const queuedEvents: Parameters<Parameters<typeof window.echosphereChat.onStreamEvent>[0]>[0][] = []

    const handleStreamEvent = (event: Parameters<Parameters<typeof window.echosphereChat.onStreamEvent>[0]>[0]) => {
      if (event.type === 'content_delta') {
        input.onContentDelta(event.delta)
        return
      }

      if (event.type === 'reasoning_delta') {
        input.onReasoningDelta(event.delta)
        return
      }

      if (event.type === 'tool_invocation_started') {
        input.onToolInvocationStarted(event.invocationId, {
          argumentsText: event.argumentsText,
          startedAt: event.startedAt,
          toolName: event.toolName,
        })
        return
      }

      if (event.type === 'tool_invocation_delta') {
        input.onToolInvocationDelta(event.invocationId, {
          argumentsText: event.argumentsText,
          toolName: event.toolName,
        })
        return
      }

      if (event.type === 'tool_invocation_completed') {
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
        unsubscribe()
        resolve({
          wasAborted: false,
        })
        return
      }

      if (event.type === 'aborted') {
        unsubscribe()
        resolve({
          wasAborted: true,
        })
        return
      }

      if (event.type === 'error') {
        unsubscribe()
        reject(new Error(event.errorMessage))
      }
    }

    const unsubscribe = window.echosphereChat.onStreamEvent((event) => {
      if (!streamId) {
        queuedEvents.push(event)
        return
      }

      if (event.streamId !== streamId) {
        return
      }

      handleStreamEvent(event)
    })

    void window.echosphereChat
      .startStream({
        messages: input.messages,
        agentContextRootPath: input.agentContextRootPath,
        chatMode: input.chatMode,
        modelId: input.modelId,
        providerId: input.providerId,
        reasoningEffort: input.reasoningEffort,
      })
      .then((result) => {
        streamId = result.streamId
        input.onStreamStarted(result.streamId)

        for (const event of queuedEvents) {
          if (event.streamId !== result.streamId) {
            continue
          }

          handleStreamEvent(event)
        }

        queuedEvents.length = 0
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
  const [streamingWaitingIndicatorVariant, setStreamingWaitingIndicatorVariant] =
    useState<AssistantWaitingIndicatorVariant | null>(null)
  const [isStreamingTextActive, setIsStreamingTextActive] = useState(false)
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const [draftChatMode, setDraftChatMode] = useState<ChatMode>('agent')
  const activeStreamIdRef = useRef<string | null>(null)
  const textStreamingIdleTimeoutRef = useRef<number | null>(null)

  const updateActiveStreamId = useCallback((streamId: string | null) => {
    activeStreamIdRef.current = streamId
    setActiveStreamId(streamId)
  }, [])

  const clearTextStreamingIdleTimeout = useCallback(() => {
    if (textStreamingIdleTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(textStreamingIdleTimeoutRef.current)
    textStreamingIdleTimeoutRef.current = null
  }, [])

  const stopTextStreaming = useCallback(() => {
    clearTextStreamingIdleTimeout()
    setIsStreamingTextActive(false)
  }, [clearTextStreamingIdleTimeout])

  const markTextStreamingPulse = useCallback(() => {
    setIsStreamingTextActive(true)
    clearTextStreamingIdleTimeout()
    textStreamingIdleTimeoutRef.current = window.setTimeout(() => {
      textStreamingIdleTimeoutRef.current = null
      setIsStreamingTextActive(false)
    }, TEXT_STREAM_IDLE_GRACE_MS)
  }, [clearTextStreamingIdleTimeout])

  useEffect(
    () => () => {
      clearTextStreamingIdleTimeout()
    },
    [clearTextStreamingIdleTimeout],
  )

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

    const insertedMessageIds: string[] = []
    const streamedMessageOrder: StreamedMessageOrderEntry[] = []
    const draftAssistantMessages = new Map<string, Message>()
    const toolInvocationMessageIds = new Map<string, string>()
    let activeAssistantDraftId: string | null = null
    let activeAssistantDraftKind: DraftAssistantMessageKind | null = null
    let reasoningDraftAssistantId: string | null = null
    let assistantDraftCount = 0
    const waitingIndicatorVariantByDraftId = new Map<string, AssistantWaitingIndicatorVariant>()

    function setActiveStreamingDraft(draftAssistantId: string) {
      setStreamingAssistantMessageId(draftAssistantId)
      setStreamingWaitingIndicatorVariant(waitingIndicatorVariantByDraftId.get(draftAssistantId) ?? 'splash')
      stopTextStreaming()
    }

    function promoteWaitingIndicatorToSplash(draftAssistantId: string) {
      const currentValue = waitingIndicatorVariantByDraftId.get(draftAssistantId)
      if (currentValue === 'splash') {
        return
      }

      waitingIndicatorVariantByDraftId.set(draftAssistantId, 'splash')
      if (activeAssistantDraftId === draftAssistantId) {
        setStreamingWaitingIndicatorVariant('splash')
      }
    }

    function appendAssistantDraft(kind: DraftAssistantMessageKind) {
      const draftAssistantMessage: Message = {
        content: '',
        id: uuidv4(),
        modelId: runtimeSelection.modelId,
        providerId,
        reasoningContent: '',
        reasoningCompletedAt: undefined,
        reasoningEffort: runtimeSelection.reasoningEffort,
        role: 'assistant',
        timestamp: Date.now(),
        toolInvocations: [],
      }

      appendLocalMessage(draftAssistantMessage)
      insertedMessageIds.push(draftAssistantMessage.id)
      streamedMessageOrder.push({
        id: draftAssistantMessage.id,
        kind: 'assistant',
      })
      draftAssistantMessages.set(draftAssistantMessage.id, draftAssistantMessage)
      assistantDraftCount += 1
      waitingIndicatorVariantByDraftId.set(draftAssistantMessage.id, assistantDraftCount === 1 ? 'thinking' : 'splash')
      activeAssistantDraftId = draftAssistantMessage.id
      activeAssistantDraftKind = kind
      setActiveStreamingDraft(draftAssistantMessage.id)

      return draftAssistantMessage.id
    }

    function getDraftAssistantMessage(draftAssistantId: string) {
      const message = draftAssistantMessages.get(draftAssistantId)
      if (!message) {
        throw new Error(`Missing draft assistant message: ${draftAssistantId}`)
      }

      return message
    }

    function updateDraftAssistantMessage(draftAssistantId: string, updater: (message: Message) => Message) {
      const nextValue = updater(getDraftAssistantMessage(draftAssistantId))
      draftAssistantMessages.set(draftAssistantId, nextValue)
      updateLocalMessage(draftAssistantId, () => nextValue)
    }

    function completeReasoningDraft(completedAt = Date.now()) {
      if (!reasoningDraftAssistantId) {
        return
      }

      const draftAssistantId = reasoningDraftAssistantId
      const draftAssistantMessage = draftAssistantMessages.get(draftAssistantId)
      reasoningDraftAssistantId = null

      if (
        !draftAssistantMessage ||
        draftAssistantMessage.role !== 'assistant' ||
        draftAssistantMessage.reasoningCompletedAt !== undefined ||
        (draftAssistantMessage.reasoningContent ?? '').trim().length === 0
      ) {
        return
      }

      updateDraftAssistantMessage(draftAssistantId, (message) => ({
        ...message,
        reasoningCompletedAt: completedAt,
      }))
    }

    function ensureAssistantDraft(kind: Exclude<DraftAssistantMessageKind, 'placeholder'>) {
      if (!activeAssistantDraftId) {
        return appendAssistantDraft(kind)
      }

      if (activeAssistantDraftKind === kind) {
        setActiveStreamingDraft(activeAssistantDraftId)
        return activeAssistantDraftId
      }

      const activeDraftMessage = getDraftAssistantMessage(activeAssistantDraftId)
      if (activeAssistantDraftKind === 'placeholder' && !hasMeaningfulAssistantOutput(activeDraftMessage)) {
        activeAssistantDraftKind = kind
        setActiveStreamingDraft(activeAssistantDraftId)
        return activeAssistantDraftId
      }

      return appendAssistantDraft(kind)
    }

    try {
      const { conversation } = await persistUserTurn({
        activeConversationId,
        chatMode: draftChatMode,
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

      appendAssistantDraft('placeholder')
      const streamedAssistant = await streamAssistantResponse({
        agentContextRootPath: conversation.agentContextRootPath,
        chatMode: conversation.chatMode,
        messages: conversation.messages,
        modelId: runtimeSelection.modelId,
        onContentDelta: (delta) => {
          completeReasoningDraft()
          const draftAssistantId = ensureAssistantDraft('content')
          promoteWaitingIndicatorToSplash(draftAssistantId)
          markTextStreamingPulse()
          updateDraftAssistantMessage(draftAssistantId, (message) => ({
            ...message,
            content: message.content + delta,
          }))
        },
        onReasoningDelta: (delta) => {
          const draftAssistantId = ensureAssistantDraft('content')
          reasoningDraftAssistantId = draftAssistantId
          promoteWaitingIndicatorToSplash(draftAssistantId)
          markTextStreamingPulse()
          updateDraftAssistantMessage(draftAssistantId, (message) => ({
            ...message,
            reasoningContent: (message.reasoningContent ?? '') + delta,
          }))
        },
        onSyntheticToolMessage: (syntheticMessage) => {
          appendLocalMessage(syntheticMessage)
          insertedMessageIds.push(syntheticMessage.id)
          streamedMessageOrder.push({
            kind: 'message',
            message: syntheticMessage,
          })
        },
        onStreamStarted: updateActiveStreamId,
        onToolInvocationCompleted: (invocationId, nextValue) => {
          completeReasoningDraft(nextValue.completedAt)
          stopTextStreaming()
          const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
          activeAssistantDraftId = draftAssistantId
          activeAssistantDraftKind = 'tool'
          setActiveStreamingDraft(draftAssistantId)
          updateDraftAssistantMessage(draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              completedAt: nextValue.completedAt,
              id: invocationId,
              resultContent: nextValue.resultContent,
              startedAt: currentValue?.startedAt ?? nextValue.completedAt ?? message.timestamp,
              state: 'completed',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationFailed: (invocationId, nextValue) => {
          completeReasoningDraft(nextValue.completedAt)
          stopTextStreaming()
          const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
          activeAssistantDraftId = draftAssistantId
          activeAssistantDraftKind = 'tool'
          setActiveStreamingDraft(draftAssistantId)
          updateDraftAssistantMessage(draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              completedAt: nextValue.completedAt,
              id: invocationId,
              resultContent: nextValue.resultContent,
              startedAt: currentValue?.startedAt ?? nextValue.completedAt ?? message.timestamp,
              state: 'failed',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationStarted: (invocationId, nextValue) => {
          completeReasoningDraft(nextValue.startedAt)
          stopTextStreaming()
          const draftAssistantId = ensureAssistantDraft('tool')
          toolInvocationMessageIds.set(invocationId, draftAssistantId)
          updateDraftAssistantMessage(draftAssistantId, (message) => ({
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
        onToolInvocationDelta: (invocationId, nextValue) => {
          stopTextStreaming()
          const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
          toolInvocationMessageIds.set(invocationId, draftAssistantId)
          updateDraftAssistantMessage(draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              id: invocationId,
              resultContent: currentValue?.resultContent,
              startedAt: currentValue?.startedAt ?? message.timestamp,
              state: currentValue?.state ?? 'running',
              toolName: nextValue.toolName,
            })),
          }))
        },
        providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
      })
      completeReasoningDraft()

      updateActiveStreamId(null)
      stopTextStreaming()

      const streamedMessages = streamedMessageOrder.flatMap((entry) => {
        if (entry.kind === 'message') {
          return [entry.message]
        }

        const draftAssistantMessage = draftAssistantMessages.get(entry.id)
        if (!draftAssistantMessage) {
          return []
        }

        if (!hasMeaningfulAssistantOutput(draftAssistantMessage)) {
          return []
        }

        return [normalizeAssistantMessage(draftAssistantMessage)]
      })

      if (streamedMessages.every((message) => !hasMeaningfulAssistantOutput(message))) {
        if (streamedAssistant.wasAborted) {
          for (const messageId of insertedMessageIds) {
            removeLocalMessage(messageId)
          }
          return
        }

        throw new Error('The assistant returned an empty response.')
      }

      for (const message of streamedMessages) {
        if (message.role !== 'assistant') {
          continue
        }

        updateLocalMessage(message.id, () => message)
      }

      setStreamingAssistantMessageId(null)
      setStreamingWaitingIndicatorVariant(null)
      const savedConversation = await persistAssistantTurn(conversation.id, streamedMessages)
      updateConversationSummary(savedConversation)
    } catch (caughtError) {
      console.error(caughtError)
      for (const messageId of insertedMessageIds) {
        removeLocalMessage(messageId)
      }

      const providerLabel = runtimeSelection.providerLabel ?? 'the selected provider'
      setError(toErrorMessage(caughtError, `Unable to get a response from ${providerLabel} right now.`))
    } finally {
      updateActiveStreamId(null)
      setStreamingAssistantMessageId(null)
      setStreamingWaitingIndicatorVariant(null)
      stopTextStreaming()
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
    isStreamingTextActive,
    isStreamingResponse: activeStreamId !== null,
    mainComposerValue,
    messages,
    selectedChatMode: draftChatMode,
    selectConversation,
    selectFolder,
    selectedFolderName,
    setSelectedChatMode: setDraftChatMode,
    abortStreamingResponse,
    sendEditedMessage,
    sendNewMessage,
    streamingAssistantMessageId,
    streamingWaitingIndicatorVariant,
    setEditComposerValue,
    setMainComposerValue,
    startEditingMessage,
  }
}
