import type { ConversationRecord, Message } from '../types/chat'
import { persistConversationSnapshot, persistUserTurn } from './chatHistoryWorkflows'
import { createChatAssistantDraftManager } from './chatAssistantDrafts'
import { streamAssistantResponse, toErrorMessage } from './chatMessageRuntime'
import type { PersistAndStreamMessageInput } from './chatMessageSendTypes'

const STREAM_PROGRESS_PERSIST_DEBOUNCE_MS = 220
const STREAM_PROGRESS_PERSIST_CHAR_FLUSH_THRESHOLD = 180

function validateRuntimeSelection(input: PersistAndStreamMessageInput) {
  if (!input.runtimeSelection.hasConfiguredProvider) {
    input.setError('No provider is configured. Configure a provider in Settings before sending messages.')
    return null
  }

  if (!input.runtimeSelection.providerId) {
    input.setError('Select a configured model before sending your message.')
    return null
  }

  if (input.runtimeSelection.modelId.trim().length === 0) {
    const providerLabel = input.runtimeSelection.providerLabel ?? 'provider'
    input.setError(`Select a ${providerLabel} model before sending your message.`)
    return null
  }

  return input.runtimeSelection.providerId
}

function isRateLimitError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const normalizedMessage = error.message.toLowerCase()
  return (
    normalizedMessage.includes('429') ||
    normalizedMessage.includes('rate limit') ||
    normalizedMessage.includes('too many requests')
  )
}

function isMessageNotFoundError(error: unknown) {
  return error instanceof Error && /^message not found:/i.test(error.message.trim())
}

function createStreamProgressPersistenceController(input: {
  conversationId: string
  setError: (errorMessage: string | null) => void
}) {
  let pendingMessages: Message[] | null = null
  let pendingFlushTimeoutId: number | null = null
  let flushPromise: Promise<ConversationRecord | null> | null = null
  let pendingDeltaCharCount = 0

  const flushPendingMessages = () => {
    if (flushPromise) {
      return flushPromise
    }

    flushPromise = (async () => {
      let latestSavedConversation: ConversationRecord | null = null

      while (pendingMessages !== null) {
        const messagesSnapshot = pendingMessages
        pendingMessages = null
        latestSavedConversation = await persistConversationSnapshot(input.conversationId, messagesSnapshot)
      }

      return latestSavedConversation
    })()
      .catch((caughtError) => {
        console.error(caughtError)
        input.setError(toErrorMessage(caughtError, 'Unable to save the latest assistant progress.'))
        return null
      })
      .finally(() => {
        flushPromise = null
      })

    return flushPromise
  }

  const queueSnapshot = (messages: Message[], options?: { immediate?: boolean }) => {
    pendingMessages = [...messages]
    pendingDeltaCharCount = options?.immediate ? 0 : pendingDeltaCharCount

    if (options?.immediate) {
      if (pendingFlushTimeoutId !== null) {
        window.clearTimeout(pendingFlushTimeoutId)
        pendingFlushTimeoutId = null
      }

      void flushPendingMessages()
      return
    }

    if (pendingFlushTimeoutId !== null) {
      return
    }

    pendingFlushTimeoutId = window.setTimeout(() => {
      pendingFlushTimeoutId = null
      void flushPendingMessages()
    }, STREAM_PROGRESS_PERSIST_DEBOUNCE_MS)
  }

  const queueSnapshotWithHint = (
    messages: Message[],
    options?: { immediate?: boolean },
    hint?: { deltaCharCount?: number },
  ) => {
    if (typeof hint?.deltaCharCount === 'number' && Number.isFinite(hint.deltaCharCount) && hint.deltaCharCount > 0) {
      pendingDeltaCharCount += hint.deltaCharCount
      if (pendingDeltaCharCount >= STREAM_PROGRESS_PERSIST_CHAR_FLUSH_THRESHOLD) {
        queueSnapshot(messages, { immediate: true })
        pendingDeltaCharCount = 0
        return
      }
    }

    queueSnapshot(messages, options)
  }

  const flush = async () => {
    if (pendingFlushTimeoutId !== null) {
      window.clearTimeout(pendingFlushTimeoutId)
      pendingFlushTimeoutId = null
    }

    pendingDeltaCharCount = 0
    return flushPendingMessages()
  }

  return {
    flush,
    queueSnapshot: queueSnapshotWithHint,
  }
}

export async function persistAndStreamMessage(input: PersistAndStreamMessageInput) {
  const providerId = validateRuntimeSelection(input)
  if (!providerId) {
    return
  }

  const initiatingConversationId = input.activeConversationId
  const initiatingFolderId = input.selectedFolderId
  let conversationIdForCleanup = initiatingConversationId
  let draftManager: ReturnType<typeof createChatAssistantDraftManager> | null = null
  let streamProgressPersistence: ReturnType<typeof createStreamProgressPersistenceController> | null = null
  let shouldKeepWaitingIndicatorActive = false
  let hasPendingDraftReservation = false

  const releasePendingDraftReservation = () => {
    if (!hasPendingDraftReservation) {
      return
    }

    hasPendingDraftReservation = false
    input.setPendingDraftSendCount((currentValue) => Math.max(0, currentValue - 1))
  }

  input.clearError()

  if (initiatingConversationId) {
    input.updateConversationRuntimeState(initiatingConversationId, {
      isSending: true,
    })
  } else {
    hasPendingDraftReservation = true
    input.setPendingDraftSendCount((currentValue) => currentValue + 1)
  }

  try {
    const { conversation } = await persistUserTurn({
      activeConversationId: initiatingConversationId,
      attachments: input.attachments,
      chatMode: input.draftChatMode,
      modelId: input.runtimeSelection.modelId,
      providerId,
      reasoningEffort: input.runtimeSelection.reasoningEffort,
      selectedFolderId: initiatingFolderId,
      targetEditMessageId: input.targetEditMessageId,
      trimmedText: input.trimmedText,
    })
    const conversationForRun =
      conversation.chatMode === input.draftChatMode
        ? conversation
        : {
            ...conversation,
            chatMode: input.draftChatMode,
          }

    conversationIdForCleanup = conversationForRun.id
    const shouldKeepSelected =
      initiatingConversationId === null
        ? input.activeConversationIdRef.current === null && input.selectedFolderIdRef.current === initiatingFolderId
        : input.activeConversationIdRef.current === conversationForRun.id

    input.upsertConversation(conversationForRun)
    input.updateConversationRuntimeState(conversationForRun.id, {
      isSending: true,
    })
    releasePendingDraftReservation()

    if (shouldKeepSelected) {
      input.applyConversation(conversationForRun)
    }

    if (input.targetEditMessageId !== null) {
      // Always clear edit mode once the edited turn is persisted to avoid stale
      // message ids being reused on later sends after history rewrites.
      input.completeEditingMessage()
    } else if (shouldKeepSelected) {
      input.setMainComposerValue('')
      input.setMainComposerAttachments([])
    }

    streamProgressPersistence = createStreamProgressPersistenceController({
      conversationId: conversationForRun.id,
      setError: input.setError,
    })

    draftManager = createChatAssistantDraftManager({
      appendLocalMessage: input.appendLocalMessage,
      conversationId: conversationForRun.id,
      initialConversationMessages: conversationForRun.messages,
      markTextStreamingPulse: input.markTextStreamingPulse,
      onConversationMessagesUpdated: (messages, options, hint) => {
        streamProgressPersistence?.queueSnapshot(messages, options, hint)
      },
      providerId,
      removeLocalMessage: input.removeLocalMessage,
      runtimeSelection: input.runtimeSelection,
      stopTextStreaming: input.stopTextStreaming,
      updateConversationRuntimeState: input.updateConversationRuntimeState,
      updateLocalMessage: input.updateLocalMessage,
    })

    draftManager.appendPlaceholderDraft()
    const streamedAssistant = await streamAssistantResponse({
      agentContextRootPath: conversationForRun.agentContextRootPath,
      chatMode: input.draftChatMode,
      messages: conversationForRun.messages,
      modelId: input.runtimeSelection.modelId,
      onContentDelta: draftManager.handleContentDelta,
      onReasoningDelta: draftManager.handleReasoningDelta,
      onStreamStarted: draftManager.handleStreamStarted,
      onSyntheticToolMessage: draftManager.handleSyntheticToolMessage,
      onToolInvocationCompleted: draftManager.handleToolInvocationCompleted,
      onToolInvocationDecisionRequested: draftManager.handleToolInvocationDecisionRequested,
      onToolInvocationDelta: draftManager.handleToolInvocationDelta,
      onToolInvocationFailed: draftManager.handleToolInvocationFailed,
      onToolInvocationStarted: draftManager.handleToolInvocationStarted,
      providerId,
      reasoningEffort: input.runtimeSelection.reasoningEffort,
      terminalExecutionMode: input.runtimeSelection.terminalExecutionMode,
    })

    const streamedMessages = draftManager.finalizeStreamedMessages(streamedAssistant.wasAborted)
    if (streamedMessages === null) {
      if (streamProgressPersistence) {
        await streamProgressPersistence.flush()
      }

      return
    }

    for (const message of streamedMessages) {
      if (message.role !== 'assistant') {
        continue
      }

      input.updateLocalMessage(conversation.id, message.id, () => message)
    }

    const finalizedConversationMessages = [...conversationForRun.messages, ...streamedMessages]
    streamProgressPersistence?.queueSnapshot(finalizedConversationMessages, { immediate: true })

    if (!(conversationForRun.id in input.conversationRuntimeStatesRef.current)) {
      return
    }

    const savedConversation =
      (await streamProgressPersistence?.flush()) ??
      (await persistConversationSnapshot(conversationForRun.id, finalizedConversationMessages))
    const savedConversationForRun =
      savedConversation.chatMode === input.draftChatMode
        ? savedConversation
        : {
            ...savedConversation,
            chatMode: input.draftChatMode,
          }
    if (!(savedConversationForRun.id in input.conversationRuntimeStatesRef.current)) {
      return
    }

    input.upsertConversation(savedConversationForRun)
    input.updateConversationSummary(savedConversationForRun)
  } catch (caughtError) {
    console.error(caughtError)
    if (input.targetEditMessageId !== null && isMessageNotFoundError(caughtError)) {
      input.completeEditingMessage()
      input.setError('This message is no longer available to edit.')
      return
    }

    const shouldRetainProgress = isRateLimitError(caughtError)
    if (draftManager) {
      if (shouldRetainProgress) {
        draftManager.showRateLimitRetryIndicator()
      } else {
        draftManager.removeInsertedMessages()
      }
    }

    if (streamProgressPersistence) {
      await streamProgressPersistence.flush()
    }

    if (shouldRetainProgress) {
      shouldKeepWaitingIndicatorActive = true
      input.setError(null)
    } else {
      const providerLabel = input.runtimeSelection.providerLabel ?? 'the selected provider'
      input.setError(toErrorMessage(caughtError, `Unable to get a response from ${providerLabel} right now.`))
    }
  } finally {
    releasePendingDraftReservation()

    if (conversationIdForCleanup) {
      if (shouldKeepWaitingIndicatorActive) {
        input.updateConversationRuntimeState(conversationIdForCleanup, {
          activeStreamId: null,
          isSending: false,
          isStreamingTextActive: false,
        })
      } else {
        input.updateConversationRuntimeState(conversationIdForCleanup, {
          activeStreamId: null,
          isSending: false,
          isStreamingTextActive: false,
          streamingAssistantMessageId: null,
          streamingWaitingIndicatorVariant: null,
        })
      }
      input.clearTextStreamingIdleTimeout(conversationIdForCleanup)
    }
  }
}
