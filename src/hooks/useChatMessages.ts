import { useCallback, useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { loadInitialChatHistory, persistAssistantTurn, persistUserTurn } from './chatHistoryWorkflows'
import { useChatComposerState } from './useChatComposerState'
import { useChatSessionState } from './useChatSessionState'
import type { AppLanguage } from '../lib/appSettings'
import type {
  AssistantWaitingIndicatorVariant,
  ChatAttachment,
  ChatMode,
  ChatProviderId,
  Message,
  ReasoningEffort,
  ToolInvocationTrace,
} from '../types/chat'

export interface ChatRuntimeSelection {
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
    nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'>,
  ) => void
  onToolInvocationFailed: (
    invocationId: string,
    nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'>,
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
          resultPresentation: event.resultPresentation,
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
          resultPresentation: event.resultPresentation,
          toolName: event.toolName,
        })
        return
      }

      if (event.type === 'completed') {
        unsubscribe()
        resolve({ wasAborted: false })
        return
      }

      if (event.type === 'aborted') {
        unsubscribe()
        resolve({ wasAborted: true })
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

export function useChatMessages(language: AppLanguage) {
  const {
    activeConversationId,
    activeConversationState,
    activeConversationTitle,
    addFolder,
    applyConversation,
    appendLocalMessage,
    clearConversationSelection,
    clearError,
    conversationGroups,
    conversationRuntimeStates,
    error,
    getDeletionContext,
    initializeHistory,
    isLoading,
    removeConversationRuntime,
    replaceConversationSummaries,
    selectedFolderId,
    selectedFolderName,
    setError,
    setIsLoading,
    updateConversationRuntimeState,
    updateConversationSummary,
    updateLocalMessage,
    removeLocalMessage,
    upsertConversation,
  } = useChatSessionState(language)

  const messages = activeConversationState?.conversation.messages ?? []
  const isSending = activeConversationState?.isSending ?? false
  const {
    mainComposerValue,
    setMainComposerValue,
    mainComposerAttachments,
    setMainComposerAttachments,
    editComposerValue,
    setEditComposerValue,
    editComposerAttachments,
    setEditComposerAttachments,
    editingMessageId,
    editComposerFocusSignal,
    resetComposerState,
    startEditingMessage: beginEditingMessage,
    cancelEditingMessage,
  } = useChatComposerState(messages, isSending)
  const [draftChatMode, setDraftChatMode] = useState<ChatMode>('agent')
  const [pendingDraftSendCount, setPendingDraftSendCount] = useState(0)
  const activeConversationIdRef = useRef<string | null>(activeConversationId)
  const selectedFolderIdRef = useRef<string | null>(selectedFolderId)
  const conversationRuntimeStatesRef = useRef(conversationRuntimeStates)
  const textStreamingIdleTimeoutRef = useRef<Record<string, number>>({})

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId
  }, [selectedFolderId])

  useEffect(() => {
    conversationRuntimeStatesRef.current = conversationRuntimeStates
  }, [conversationRuntimeStates])

  const clearTextStreamingIdleTimeout = useCallback((conversationId: string) => {
    const timeoutId = textStreamingIdleTimeoutRef.current[conversationId]
    if (timeoutId === undefined) {
      return
    }

    window.clearTimeout(timeoutId)
    delete textStreamingIdleTimeoutRef.current[conversationId]
  }, [])

  const stopTextStreaming = useCallback(
    (conversationId: string) => {
      clearTextStreamingIdleTimeout(conversationId)
      updateConversationRuntimeState(conversationId, {
        isStreamingTextActive: false,
      })
    },
    [clearTextStreamingIdleTimeout, updateConversationRuntimeState],
  )

  const markTextStreamingPulse = useCallback(
    (conversationId: string) => {
      updateConversationRuntimeState(conversationId, {
        isStreamingTextActive: true,
      })
      clearTextStreamingIdleTimeout(conversationId)
      textStreamingIdleTimeoutRef.current[conversationId] = window.setTimeout(() => {
        delete textStreamingIdleTimeoutRef.current[conversationId]
        updateConversationRuntimeState(conversationId, {
          isStreamingTextActive: false,
        })
      }, TEXT_STREAM_IDLE_GRACE_MS)
    },
    [clearTextStreamingIdleTimeout, updateConversationRuntimeState],
  )

  useEffect(
    () => () => {
      for (const timeoutId of Object.values(textStreamingIdleTimeoutRef.current)) {
        window.clearTimeout(timeoutId)
      }

      textStreamingIdleTimeoutRef.current = {}
    },
    [],
  )

  function resetDraft(nextFolderId: string | null) {
    resetComposerState()
    clearConversationSelection(nextFolderId)
  }

  useEffect(() => {
    let isMounted = true

    async function initializeConversations() {
      try {
        const { conversationSummaries, folderSummaries, initialConversation } = await loadInitialChatHistory()

        if (!isMounted) {
          return
        }

        initializeHistory({ conversationSummaries, folderSummaries, initialConversation })
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
  }

  const startEditingMessage = useCallback(
    (messageId: string) => {
      clearError()
      beginEditingMessage(messageId)
    },
    [beginEditingMessage, clearError],
  )

  const getCurrentConversationStreamId = useCallback((conversationId: string) => {
    return conversationRuntimeStatesRef.current[conversationId]?.activeStreamId ?? null
  }, [])

  async function persistAndStreamMessage(
    trimmedText: string,
    attachments: ChatAttachment[],
    targetEditMessageId: string | null,
    runtimeSelection: ChatRuntimeSelection,
  ) {
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
    const initiatingConversationId = activeConversationId
    const initiatingFolderId = selectedFolderId

    clearError()

    if (initiatingConversationId) {
      updateConversationRuntimeState(initiatingConversationId, {
        isSending: true,
      })
    } else {
      setPendingDraftSendCount((currentValue) => currentValue + 1)
    }

    const insertedMessageIds: string[] = []
    const streamedMessageOrder: StreamedMessageOrderEntry[] = []
    const draftAssistantMessages = new Map<string, Message>()
    const toolInvocationMessageIds = new Map<string, string>()
    const waitingIndicatorVariantByDraftId = new Map<string, AssistantWaitingIndicatorVariant>()
    let activeAssistantDraftId: string | null = null
    let activeAssistantDraftKind: DraftAssistantMessageKind | null = null
    let reasoningDraftAssistantId: string | null = null
    let assistantDraftCount = 0
    let conversationIdForCleanup = initiatingConversationId

    function updateStreamingIndicatorState(conversationId: string, draftAssistantId: string) {
      updateConversationRuntimeState(conversationId, {
        streamingAssistantMessageId: draftAssistantId,
        streamingWaitingIndicatorVariant: waitingIndicatorVariantByDraftId.get(draftAssistantId) ?? 'splash',
      })
      stopTextStreaming(conversationId)
    }

    function promoteWaitingIndicatorToSplash(conversationId: string, draftAssistantId: string) {
      const currentValue = waitingIndicatorVariantByDraftId.get(draftAssistantId)
      if (currentValue === 'splash') {
        return
      }

      waitingIndicatorVariantByDraftId.set(draftAssistantId, 'splash')
      if (activeAssistantDraftId !== draftAssistantId) {
        return
      }

      updateConversationRuntimeState(conversationId, {
        streamingWaitingIndicatorVariant: 'splash',
      })
    }

    function appendAssistantDraft(conversationId: string, kind: DraftAssistantMessageKind) {
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

      appendLocalMessage(conversationId, draftAssistantMessage)
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
      updateStreamingIndicatorState(conversationId, draftAssistantMessage.id)

      return draftAssistantMessage.id
    }

    function getDraftAssistantMessage(draftAssistantId: string) {
      const message = draftAssistantMessages.get(draftAssistantId)
      if (!message) {
        throw new Error(`Missing draft assistant message: ${draftAssistantId}`)
      }

      return message
    }

    function updateDraftAssistantMessage(
      conversationId: string,
      draftAssistantId: string,
      updater: (message: Message) => Message,
    ) {
      const nextValue = updater(getDraftAssistantMessage(draftAssistantId))
      draftAssistantMessages.set(draftAssistantId, nextValue)
      updateLocalMessage(conversationId, draftAssistantId, () => nextValue)
    }

    function completeReasoningDraft(conversationId: string, completedAt = Date.now()) {
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

      updateDraftAssistantMessage(conversationId, draftAssistantId, (message) => ({
        ...message,
        reasoningCompletedAt: completedAt,
      }))
    }

    function ensureAssistantDraft(conversationId: string, kind: Exclude<DraftAssistantMessageKind, 'placeholder'>) {
      if (!activeAssistantDraftId) {
        return appendAssistantDraft(conversationId, kind)
      }

      if (activeAssistantDraftKind === kind) {
        updateStreamingIndicatorState(conversationId, activeAssistantDraftId)
        return activeAssistantDraftId
      }

      const activeDraftMessage = getDraftAssistantMessage(activeAssistantDraftId)
      if (activeAssistantDraftKind === 'placeholder' && !hasMeaningfulAssistantOutput(activeDraftMessage)) {
        activeAssistantDraftKind = kind
        updateStreamingIndicatorState(conversationId, activeAssistantDraftId)
        return activeAssistantDraftId
      }

      return appendAssistantDraft(conversationId, kind)
    }

    try {
      const { conversation } = await persistUserTurn({
        activeConversationId: initiatingConversationId,
        chatMode: draftChatMode,
        modelId: runtimeSelection.modelId,
        providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
        selectedFolderId: initiatingFolderId,
        targetEditMessageId,
        attachments,
        trimmedText,
      })

      conversationIdForCleanup = conversation.id
      const shouldKeepSelected =
        initiatingConversationId === null
          ? activeConversationIdRef.current === null && selectedFolderIdRef.current === initiatingFolderId
          : activeConversationIdRef.current === conversation.id

      upsertConversation(conversation)
      updateConversationRuntimeState(conversation.id, {
        isSending: true,
      })

      if (shouldKeepSelected) {
        applyConversation(conversation)
      }

      if (targetEditMessageId !== null) {
        if (shouldKeepSelected) {
          cancelEditingMessage()
        }
      } else if (shouldKeepSelected) {
        setMainComposerValue('')
        setMainComposerAttachments([])
      }

      appendAssistantDraft(conversation.id, 'placeholder')
      const streamedAssistant = await streamAssistantResponse({
        agentContextRootPath: conversation.agentContextRootPath,
        chatMode: conversation.chatMode,
        messages: conversation.messages,
        modelId: runtimeSelection.modelId,
        onContentDelta: (delta) => {
          completeReasoningDraft(conversation.id)
          const draftAssistantId = ensureAssistantDraft(conversation.id, 'content')
          promoteWaitingIndicatorToSplash(conversation.id, draftAssistantId)
          markTextStreamingPulse(conversation.id)
          updateDraftAssistantMessage(conversation.id, draftAssistantId, (message) => ({
            ...message,
            content: message.content + delta,
          }))
        },
        onReasoningDelta: (delta) => {
          const draftAssistantId = ensureAssistantDraft(conversation.id, 'content')
          reasoningDraftAssistantId = draftAssistantId
          promoteWaitingIndicatorToSplash(conversation.id, draftAssistantId)
          markTextStreamingPulse(conversation.id)
          updateDraftAssistantMessage(conversation.id, draftAssistantId, (message) => ({
            ...message,
            reasoningContent: (message.reasoningContent ?? '') + delta,
          }))
        },
        onSyntheticToolMessage: (syntheticMessage) => {
          appendLocalMessage(conversation.id, syntheticMessage)
          insertedMessageIds.push(syntheticMessage.id)
          streamedMessageOrder.push({
            kind: 'message',
            message: syntheticMessage,
          })
        },
        onStreamStarted: (streamId) => {
          updateConversationRuntimeState(conversation.id, {
            activeStreamId: streamId,
          })
        },
        onToolInvocationCompleted: (invocationId, nextValue) => {
          completeReasoningDraft(conversation.id, nextValue.completedAt)
          stopTextStreaming(conversation.id)
          const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft(conversation.id, 'tool')
          activeAssistantDraftId = draftAssistantId
          activeAssistantDraftKind = 'tool'
          updateStreamingIndicatorState(conversation.id, draftAssistantId)
          updateDraftAssistantMessage(conversation.id, draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              completedAt: nextValue.completedAt,
              id: invocationId,
              resultContent: nextValue.resultContent,
              resultPresentation: nextValue.resultPresentation,
              startedAt: currentValue?.startedAt ?? nextValue.completedAt ?? message.timestamp,
              state: 'completed',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationFailed: (invocationId, nextValue) => {
          completeReasoningDraft(conversation.id, nextValue.completedAt)
          stopTextStreaming(conversation.id)
          const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft(conversation.id, 'tool')
          activeAssistantDraftId = draftAssistantId
          activeAssistantDraftKind = 'tool'
          updateStreamingIndicatorState(conversation.id, draftAssistantId)
          updateDraftAssistantMessage(conversation.id, draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              completedAt: nextValue.completedAt,
              id: invocationId,
              resultContent: nextValue.resultContent,
              resultPresentation: nextValue.resultPresentation,
              startedAt: currentValue?.startedAt ?? nextValue.completedAt ?? message.timestamp,
              state: 'failed',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationStarted: (invocationId, nextValue) => {
          completeReasoningDraft(conversation.id, nextValue.startedAt)
          stopTextStreaming(conversation.id)
          const draftAssistantId = ensureAssistantDraft(conversation.id, 'tool')
          toolInvocationMessageIds.set(invocationId, draftAssistantId)
          updateDraftAssistantMessage(conversation.id, draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              id: invocationId,
              resultContent: currentValue?.resultContent,
              resultPresentation: currentValue?.resultPresentation,
              startedAt: currentValue?.startedAt ?? nextValue.startedAt,
              state: 'running',
              toolName: nextValue.toolName,
            })),
          }))
        },
        onToolInvocationDelta: (invocationId, nextValue) => {
          stopTextStreaming(conversation.id)
          const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft(conversation.id, 'tool')
          toolInvocationMessageIds.set(invocationId, draftAssistantId)
          updateDraftAssistantMessage(conversation.id, draftAssistantId, (message) => ({
            ...message,
            toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
              argumentsText: nextValue.argumentsText,
              id: invocationId,
              resultContent: currentValue?.resultContent,
              resultPresentation: currentValue?.resultPresentation,
              startedAt: currentValue?.startedAt ?? message.timestamp,
              state: currentValue?.state ?? 'running',
              toolName: nextValue.toolName,
            })),
          }))
        },
        providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
      })
      completeReasoningDraft(conversation.id)

      updateConversationRuntimeState(conversation.id, {
        activeStreamId: null,
        streamingAssistantMessageId: null,
        streamingWaitingIndicatorVariant: null,
      })
      stopTextStreaming(conversation.id)

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
            removeLocalMessage(conversation.id, messageId)
          }
          return
        }

        throw new Error('The assistant returned an empty response.')
      }

      for (const message of streamedMessages) {
        if (message.role !== 'assistant') {
          continue
        }

        updateLocalMessage(conversation.id, message.id, () => message)
      }

      if (!(conversation.id in conversationRuntimeStatesRef.current)) {
        return
      }

      const savedConversation = await persistAssistantTurn(conversation.id, streamedMessages)
      if (!(savedConversation.id in conversationRuntimeStatesRef.current)) {
        return
      }

      upsertConversation(savedConversation)
      updateConversationSummary(savedConversation)
    } catch (caughtError) {
      console.error(caughtError)
      if (conversationIdForCleanup) {
        for (const messageId of insertedMessageIds) {
          removeLocalMessage(conversationIdForCleanup, messageId)
        }
      }

      const providerLabel = runtimeSelection.providerLabel ?? 'the selected provider'
      setError(toErrorMessage(caughtError, `Unable to get a response from ${providerLabel} right now.`))
    } finally {
      if (initiatingConversationId === null) {
        setPendingDraftSendCount((currentValue) => Math.max(0, currentValue - 1))
      }

      if (conversationIdForCleanup) {
        updateConversationRuntimeState(conversationIdForCleanup, {
          activeStreamId: null,
          isSending: false,
          isStreamingTextActive: false,
          streamingAssistantMessageId: null,
          streamingWaitingIndicatorVariant: null,
        })
        clearTextStreamingIdleTimeout(conversationIdForCleanup)
      }
    }
  }

  async function sendNewMessage(runtimeSelection: ChatRuntimeSelection) {
    if (activeConversationState?.isSending || (activeConversationId === null && pendingDraftSendCount > 0)) {
      return
    }

    const trimmedText = mainComposerValue.trim()
    if (trimmedText.length === 0 && mainComposerAttachments.length === 0) {
      return
    }

    await persistAndStreamMessage(trimmedText, mainComposerAttachments, null, runtimeSelection)
  }

  async function sendEditedMessage(runtimeSelection: ChatRuntimeSelection) {
    if (
      editingMessageId === null ||
      activeConversationState?.isSending ||
      (activeConversationId === null && pendingDraftSendCount > 0)
    ) {
      return
    }

    const trimmedText = editComposerValue.trim()
    if (trimmedText.length === 0 && editComposerAttachments.length === 0) {
      return
    }

    await persistAndStreamMessage(trimmedText, editComposerAttachments, editingMessageId, runtimeSelection)
  }

  const abortStreamingResponse = useCallback(async () => {
    if (!activeConversationId) {
      return
    }

    const streamId = getCurrentConversationStreamId(activeConversationId)
    if (!streamId) {
      return
    }

    try {
      await window.echosphereChat.cancelStream(streamId)
    } catch (caughtError) {
      console.error(caughtError)
      setError('Unable to stop the current response.')
    }
  }, [activeConversationId, getCurrentConversationStreamId, setError])

  async function deleteConversation(conversationId: string) {
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
  }

  const isActiveDraftSending = activeConversationId === null && pendingDraftSendCount > 0

  return {
    activeConversationId,
    activeConversationRootPath: activeConversationState?.conversation.agentContextRootPath ?? null,
    activeConversationTitle,
    cancelEditingMessage,
    conversationGroups,
    createConversation,
    createFolder,
    deleteConversation,
    editComposerAttachments,
    editComposerFocusSignal,
    editComposerValue,
    editingMessageId,
    error,
    isEditingMessage: editingMessageId !== null,
    isLoading,
    isSending: activeConversationState?.isSending ?? isActiveDraftSending,
    isStreamingResponse: activeConversationState?.activeStreamId !== null,
    isStreamingTextActive: activeConversationState?.isStreamingTextActive ?? false,
    mainComposerAttachments,
    mainComposerValue,
    messages,
    selectedChatMode: draftChatMode,
    selectedFolderName,
    selectConversation,
    selectFolder,
    setEditComposerAttachments,
    setEditComposerValue,
    setMainComposerAttachments,
    setMainComposerValue,
    setSelectedChatMode: setDraftChatMode,
    startEditingMessage,
    streamingAssistantMessageId: activeConversationState?.streamingAssistantMessageId ?? null,
    streamingWaitingIndicatorVariant: activeConversationState?.streamingWaitingIndicatorVariant ?? null,
    abortStreamingResponse,
    sendEditedMessage,
    sendNewMessage,
  }
}

export type ChatMessagesController = ReturnType<typeof useChatMessages>
