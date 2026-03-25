import { v4 as uuidv4 } from 'uuid'
import {
  hasMeaningfulAssistantOutput,
  normalizeAssistantMessage,
  upsertToolInvocation,
  type ChatRuntimeSelection,
} from './chatMessageRuntime'
import { normalizeAssistantMessageContent, splitThinkingContent } from '../lib/chatMessageContent'
import type { AssistantWaitingIndicatorVariant, Message, ToolInvocationTrace } from '../types/chat'
import type { ConversationRuntimeStatePatch } from './chatMessageSendTypes'

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

interface CreateChatAssistantDraftManagerInput {
  appendLocalMessage: (conversationId: string, message: Message) => void
  conversationId: string
  initialConversationMessages: Message[]
  markTextStreamingPulse: (conversationId: string) => void
  onConversationMessagesUpdated: (
    messages: Message[],
    options?: { immediate?: boolean },
    hint?: { deltaCharCount?: number },
  ) => void
  providerId: NonNullable<ChatRuntimeSelection['providerId']>
  removeLocalMessage: (conversationId: string, messageId: string) => void
  runtimeSelection: ChatRuntimeSelection
  stopTextStreaming: (conversationId: string) => void
  updateConversationRuntimeState: (conversationId: string, input: ConversationRuntimeStatePatch) => void
  updateLocalMessage: (conversationId: string, messageId: string, updater: (message: Message) => Message) => void
}

function buildToolInvocationState(
  invocationId: string,
  nextValue:
    | Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName' | 'decisionRequest'>
    | Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'>,
  currentValue: ToolInvocationTrace | null,
  message: Message,
  state: ToolInvocationTrace['state'],
) {
  return {
    argumentsText: nextValue.argumentsText,
    ...(state === 'running'
      ? {
          decisionRequest:
            'decisionRequest' in nextValue
              ? nextValue.decisionRequest
              : (currentValue?.decisionRequest ?? undefined),
          resultContent: currentValue?.resultContent,
          resultPresentation: currentValue?.resultPresentation,
        }
      : {
          completedAt: (nextValue as Pick<ToolInvocationTrace, 'completedAt'>).completedAt,
          decisionRequest: undefined,
          resultContent: (nextValue as Pick<ToolInvocationTrace, 'resultContent'>).resultContent,
          resultPresentation: (nextValue as Pick<ToolInvocationTrace, 'resultPresentation'>).resultPresentation,
        }),
    id: invocationId,
    startedAt:
      currentValue?.startedAt ??
      ('startedAt' in nextValue ? nextValue.startedAt : (nextValue.completedAt ?? message.timestamp)),
    state,
    toolName: nextValue.toolName,
  } satisfies ToolInvocationTrace
}

function finalizeIncompleteToolInvocations(
  message: Message,
  input: {
    completedAt: number
    failureMessage: string
  },
) {
  if (message.role !== 'assistant' || !message.toolInvocations?.some((invocation) => invocation.state === 'running')) {
    return message
  }

  return {
    ...message,
    toolInvocations: message.toolInvocations.map((invocation) =>
      invocation.state !== 'running'
        ? invocation
        : ({
            ...invocation,
            completedAt: input.completedAt,
            decisionRequest: undefined,
            resultContent: invocation.resultContent ?? input.failureMessage,
            state: 'failed',
          } satisfies ToolInvocationTrace),
    ),
  }
}

function mergeStreamingDelta(existingValue: string, nextDelta: string) {
  if (nextDelta.length === 0) {
    return existingValue
  }

  if (existingValue.length === 0) {
    return nextDelta
  }

  if (existingValue.endsWith(nextDelta)) {
    return existingValue
  }

  if (nextDelta.startsWith(existingValue)) {
    return nextDelta
  }

  const maxOverlap = Math.min(existingValue.length, nextDelta.length)
  let overlapLength = 0

  for (let index = maxOverlap; index > 0; index -= 1) {
    if (existingValue.slice(-index) === nextDelta.slice(0, index)) {
      overlapLength = index
      break
    }
  }

  return existingValue + nextDelta.slice(overlapLength)
}

export function createChatAssistantDraftManager(input: CreateChatAssistantDraftManagerInput) {
  const insertedMessageIds: string[] = []
  const streamedMessageOrder: StreamedMessageOrderEntry[] = []
  const draftAssistantMessages = new Map<string, Message>()
  const toolInvocationMessageIds = new Map<string, string>()
  const waitingIndicatorVariantByDraftId = new Map<string, AssistantWaitingIndicatorVariant>()
  let conversationMessagesSnapshot = [...input.initialConversationMessages]
  let activeAssistantDraftId: string | null = null
  let activeAssistantDraftKind: DraftAssistantMessageKind | null = null
  let reasoningDraftAssistantId: string | null = null
  let assistantDraftCount = 0

  const notifyConversationMessagesUpdated = (options?: { immediate?: boolean }, hint?: { deltaCharCount?: number }) => {
    input.onConversationMessagesUpdated([...conversationMessagesSnapshot], options, hint)
  }

  const appendSnapshotMessage = (
    message: Message,
    options?: { immediate?: boolean },
    hint?: { deltaCharCount?: number },
  ) => {
    conversationMessagesSnapshot = [...conversationMessagesSnapshot, message]
    notifyConversationMessagesUpdated(options, hint)
  }

  const updateSnapshotMessage = (
    messageId: string,
    nextMessage: Message,
    options?: { immediate?: boolean },
    hint?: { deltaCharCount?: number },
  ) => {
    let wasUpdated = false
    conversationMessagesSnapshot = conversationMessagesSnapshot.map((message) => {
      if (message.id !== messageId) {
        return message
      }

      wasUpdated = true
      return nextMessage
    })

    if (wasUpdated) {
      notifyConversationMessagesUpdated(options, hint)
    }
  }

  const removeSnapshotMessage = (messageId: string) => {
    const nextMessages = conversationMessagesSnapshot.filter((message) => message.id !== messageId)
    const wasUpdated = nextMessages.length !== conversationMessagesSnapshot.length
    conversationMessagesSnapshot = nextMessages
    return wasUpdated
  }

  const removeInsertedMessages = () => {
    let hasConversationSnapshotChanges = false
    for (const messageId of insertedMessageIds) {
      input.removeLocalMessage(input.conversationId, messageId)
      if (removeSnapshotMessage(messageId)) {
        hasConversationSnapshotChanges = true
      }
    }

    if (hasConversationSnapshotChanges) {
      notifyConversationMessagesUpdated({ immediate: true })
    }
  }

  const updateStreamingIndicatorState = (draftAssistantId: string) => {
    input.updateConversationRuntimeState(input.conversationId, {
      streamingAssistantMessageId: draftAssistantId,
      streamingWaitingIndicatorVariant: waitingIndicatorVariantByDraftId.get(draftAssistantId) ?? 'splash',
    })
    input.stopTextStreaming(input.conversationId)
  }

  const appendAssistantDraft = (kind: DraftAssistantMessageKind) => {
    const draftAssistantMessage: Message = {
      content: '',
      id: uuidv4(),
      modelId: input.runtimeSelection.modelId,
      providerId: input.providerId,
      reasoningContent: '',
      reasoningCompletedAt: undefined,
      reasoningEffort: input.runtimeSelection.reasoningEffort,
      role: 'assistant',
      timestamp: Date.now(),
      toolInvocations: [],
    }

    input.appendLocalMessage(input.conversationId, draftAssistantMessage)
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
    conversationMessagesSnapshot = [...conversationMessagesSnapshot, draftAssistantMessage]
    if (kind !== 'placeholder') {
      notifyConversationMessagesUpdated()
    }
    updateStreamingIndicatorState(draftAssistantMessage.id)

    return draftAssistantMessage.id
  }

  const getDraftAssistantMessage = (draftAssistantId: string) => {
    const message = draftAssistantMessages.get(draftAssistantId)
    if (!message) {
      throw new Error(`Missing draft assistant message: ${draftAssistantId}`)
    }

    return message
  }

  const updateDraftAssistantMessage = (
    draftAssistantId: string,
    updater: (message: Message) => Message,
    options?: { immediate?: boolean },
    hint?: { deltaCharCount?: number },
  ) => {
    const nextValue = updater(getDraftAssistantMessage(draftAssistantId))
    draftAssistantMessages.set(draftAssistantId, nextValue)
    input.updateLocalMessage(input.conversationId, draftAssistantId, () => nextValue)
    updateSnapshotMessage(draftAssistantId, nextValue, options, hint)
  }

  const completeReasoningDraft = (completedAt = Date.now()) => {
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
      normalizeAssistantMessageContent(draftAssistantMessage).reasoningContent.trim().length === 0
    ) {
      return
    }

    updateDraftAssistantMessage(draftAssistantId, (message) => ({
      ...message,
      reasoningCompletedAt: completedAt,
    }))
  }

  const ensureAssistantDraft = (kind: Exclude<DraftAssistantMessageKind, 'placeholder'>) => {
    if (!activeAssistantDraftId) {
      return appendAssistantDraft(kind)
    }

    if (activeAssistantDraftKind === kind) {
      updateStreamingIndicatorState(activeAssistantDraftId)
      return activeAssistantDraftId
    }

    const activeDraftMessage = getDraftAssistantMessage(activeAssistantDraftId)
    if (activeAssistantDraftKind === 'placeholder' && !hasMeaningfulAssistantOutput(activeDraftMessage)) {
      activeAssistantDraftKind = kind
      updateStreamingIndicatorState(activeAssistantDraftId)
      return activeAssistantDraftId
    }

    return appendAssistantDraft(kind)
  }

  const ensureReasoningDraft = () => {
    const draftAssistantId = ensureAssistantDraft('content')
    const draftAssistantMessage = getDraftAssistantMessage(draftAssistantId)
    const normalizedContent = normalizeAssistantMessageContent(draftAssistantMessage)
    const hasVisibleContent = normalizedContent.content.trim().length > 0
    const hasToolInvocations = (draftAssistantMessage.toolInvocations?.length ?? 0) > 0
    const reasoningAlreadyCompleted = draftAssistantMessage.reasoningCompletedAt !== undefined

    if (!hasVisibleContent && !hasToolInvocations && !reasoningAlreadyCompleted) {
      return draftAssistantId
    }

    completeReasoningDraft()
    return appendAssistantDraft('content')
  }

  const promoteWaitingIndicatorToSplash = (draftAssistantId: string) => {
    const currentValue = waitingIndicatorVariantByDraftId.get(draftAssistantId)
    if (currentValue === 'splash') {
      return
    }

    waitingIndicatorVariantByDraftId.set(draftAssistantId, 'splash')
    if (activeAssistantDraftId !== draftAssistantId) {
      return
    }

    input.updateConversationRuntimeState(input.conversationId, {
      streamingWaitingIndicatorVariant: 'splash',
    })
  }

  const updateToolInvocation = (
    draftAssistantId: string,
    invocationId: string,
    state: ToolInvocationTrace['state'],
    nextValue:
      | Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName' | 'decisionRequest'>
      | Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'>,
    options?: { immediate?: boolean },
  ) => {
    updateDraftAssistantMessage(draftAssistantId, (message) => ({
      ...message,
      toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) =>
        buildToolInvocationState(invocationId, nextValue, currentValue, message, state),
      ),
    }), options)
  }

  return {
    appendPlaceholderDraft() {
      appendAssistantDraft('placeholder')
    },
    completeReasoningDraft,
    handleContentDelta(delta: string) {
      const draftAssistantId = ensureAssistantDraft('content')
      const draftAssistantMessage = getDraftAssistantMessage(draftAssistantId)
      const nextContent = mergeStreamingDelta(draftAssistantMessage.content, delta)
      const appendedCharCount = Math.max(0, nextContent.length - draftAssistantMessage.content.length)
      const nextContentParts = splitThinkingContent(nextContent)
      const hasCompletedThinkBlock = nextContentParts.reasoningContent.trim().length > 0 && nextContent.includes('</think>')

      if (nextContentParts.reasoningContent.trim().length > 0) {
        reasoningDraftAssistantId = draftAssistantId
      }

      promoteWaitingIndicatorToSplash(draftAssistantId)
      input.markTextStreamingPulse(input.conversationId)
      updateDraftAssistantMessage(draftAssistantId, (message) => ({
        ...message,
        content: nextContent,
      }), undefined, { deltaCharCount: appendedCharCount })

      if (hasCompletedThinkBlock) {
        completeReasoningDraft()
      }
    },
    handleReasoningDelta(delta: string) {
      const draftAssistantId = ensureReasoningDraft()
      let shouldCompleteReasoning = false
      let appendedCharCount = 0
      reasoningDraftAssistantId = draftAssistantId
      promoteWaitingIndicatorToSplash(draftAssistantId)
      input.markTextStreamingPulse(input.conversationId)
      updateDraftAssistantMessage(draftAssistantId, (message) => {
        const currentReasoningContent = message.reasoningContent ?? ''
        const nextReasoningContent = mergeStreamingDelta(message.reasoningContent ?? '', delta)
        appendedCharCount = Math.max(0, nextReasoningContent.length - currentReasoningContent.length)
        shouldCompleteReasoning = splitThinkingContent(nextReasoningContent).hasThinkingTags && nextReasoningContent.includes('</think>')
        if (nextReasoningContent === currentReasoningContent) {
          return message
        }

        return {
          ...message,
          reasoningContent: nextReasoningContent,
        }
      }, undefined, { deltaCharCount: appendedCharCount })

      if (shouldCompleteReasoning) {
        completeReasoningDraft()
      }
    }, 
    handleSyntheticToolMessage(syntheticMessage: Message) {
      input.appendLocalMessage(input.conversationId, syntheticMessage)
      insertedMessageIds.push(syntheticMessage.id)
      streamedMessageOrder.push({
        kind: 'message',
        message: syntheticMessage,
      })
      appendSnapshotMessage(syntheticMessage, { immediate: true })
    },
    handleStreamStarted(streamId: string) {
      input.updateConversationRuntimeState(input.conversationId, {
        activeStreamId: streamId,
      })
    },
    handleToolInvocationCompleted(
      invocationId: string,
      nextValue: Pick<
        ToolInvocationTrace,
        'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'
      >,
    ) {
      completeReasoningDraft(nextValue.completedAt)
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
      activeAssistantDraftId = draftAssistantId
      activeAssistantDraftKind = 'tool'
      updateStreamingIndicatorState(draftAssistantId)
      updateToolInvocation(draftAssistantId, invocationId, 'completed', nextValue, { immediate: true })
    },
    handleToolInvocationDelta(
      invocationId: string,
      nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'toolName'>,
    ) {
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
      toolInvocationMessageIds.set(invocationId, draftAssistantId)
      const draftAssistantMessage = getDraftAssistantMessage(draftAssistantId)
      const currentArgumentsTextLength =
        draftAssistantMessage.toolInvocations?.find((invocation) => invocation.id === invocationId)?.argumentsText
          .length ?? 0
      const deltaCharCount = Math.max(0, nextValue.argumentsText.length - currentArgumentsTextLength)
      updateDraftAssistantMessage(draftAssistantId, (message) => ({
        ...message,
        toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) => ({
          argumentsText: nextValue.argumentsText,
          decisionRequest: currentValue?.decisionRequest,
          id: invocationId,
          resultContent: currentValue?.resultContent,
          resultPresentation: currentValue?.resultPresentation,
          startedAt: currentValue?.startedAt ?? message.timestamp,
          state: currentValue?.state ?? 'running',
          toolName: nextValue.toolName,
        })),
      }), undefined, { deltaCharCount })
    },
    handleToolInvocationDecisionRequested(
      invocationId: string,
      nextValue: Pick<ToolInvocationTrace, 'toolName' | 'decisionRequest'>,
    ) {
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
      toolInvocationMessageIds.set(invocationId, draftAssistantId)
      const draftAssistantMessage = getDraftAssistantMessage(draftAssistantId)
      const currentInvocation =
        draftAssistantMessage.toolInvocations?.find((invocation) => invocation.id === invocationId) ?? null

      updateToolInvocation(
        draftAssistantId,
        invocationId,
        'running',
        {
          argumentsText: currentInvocation?.argumentsText ?? '',
          decisionRequest: nextValue.decisionRequest,
          startedAt: currentInvocation?.startedAt ?? Date.now(),
          toolName: nextValue.toolName,
        },
        { immediate: true },
      )
    },
    handleToolInvocationFailed(
      invocationId: string,
      nextValue: Pick<
        ToolInvocationTrace,
        'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'
      >,
    ) {
      completeReasoningDraft(nextValue.completedAt)
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
      activeAssistantDraftId = draftAssistantId
      activeAssistantDraftKind = 'tool'
      updateStreamingIndicatorState(draftAssistantId)
      updateToolInvocation(draftAssistantId, invocationId, 'failed', nextValue, { immediate: true })
    },
    handleToolInvocationStarted(
      invocationId: string,
      nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName'>,
    ) {
      completeReasoningDraft(nextValue.startedAt)
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = ensureAssistantDraft('tool')
      toolInvocationMessageIds.set(invocationId, draftAssistantId)
      updateToolInvocation(draftAssistantId, invocationId, 'running', nextValue, { immediate: true })
    },
    finalizeStreamedMessages(wasAborted: boolean, failureMessage?: string) {
      completeReasoningDraft()
      input.updateConversationRuntimeState(input.conversationId, {
        activeStreamId: null,
        streamingAssistantMessageId: null,
        streamingWaitingIndicatorVariant: null,
      })
      input.stopTextStreaming(input.conversationId)
      const finalizedAt = Date.now()
      const incompleteToolFailureMessage =
        failureMessage ??
        (wasAborted ? 'Tool execution aborted before completion.' : 'Tool execution ended before completion.')

      const streamedMessages = streamedMessageOrder.flatMap((entry) => {
        if (entry.kind === 'message') {
          return [entry.message]
        }

        const draftAssistantMessage = draftAssistantMessages.get(entry.id)
        if (!draftAssistantMessage || !hasMeaningfulAssistantOutput(draftAssistantMessage)) {
          return []
        }

        return [
          normalizeAssistantMessage(
            finalizeIncompleteToolInvocations(draftAssistantMessage, {
              completedAt: finalizedAt,
              failureMessage: incompleteToolFailureMessage,
            }),
          ),
        ]
      })

      if (streamedMessages.every((message) => !hasMeaningfulAssistantOutput(message))) {
        if (wasAborted) {
          removeInsertedMessages()
          return null
        }

        throw new Error('The assistant returned an empty response.')
      }

      return streamedMessages
    },
    showRateLimitRetryIndicator() {
      const draftAssistantId = activeAssistantDraftId ?? appendAssistantDraft('placeholder')
      waitingIndicatorVariantByDraftId.set(draftAssistantId, 'rate_limit_retry')
      activeAssistantDraftId = draftAssistantId
      input.stopTextStreaming(input.conversationId)
      input.updateConversationRuntimeState(input.conversationId, {
        streamingAssistantMessageId: draftAssistantId,
        streamingWaitingIndicatorVariant: 'rate_limit_retry',
      })
    },
    removeInsertedMessages,
  }
}
