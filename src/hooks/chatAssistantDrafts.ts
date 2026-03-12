import { v4 as uuidv4 } from 'uuid'
import {
  hasMeaningfulAssistantOutput,
  normalizeAssistantMessage,
  upsertToolInvocation,
  type ChatRuntimeSelection,
} from './chatMessageRuntime'
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
  markTextStreamingPulse: (conversationId: string) => void
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
    | Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName'>
    | Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'>,
  currentValue: ToolInvocationTrace | null,
  message: Message,
  state: ToolInvocationTrace['state'],
) {
  return {
    argumentsText: nextValue.argumentsText,
    ...(state === 'running'
      ? {}
      : {
          completedAt: (nextValue as Pick<ToolInvocationTrace, 'completedAt'>).completedAt,
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

export function createChatAssistantDraftManager(input: CreateChatAssistantDraftManagerInput) {
  const insertedMessageIds: string[] = []
  const streamedMessageOrder: StreamedMessageOrderEntry[] = []
  const draftAssistantMessages = new Map<string, Message>()
  const toolInvocationMessageIds = new Map<string, string>()
  const waitingIndicatorVariantByDraftId = new Map<string, AssistantWaitingIndicatorVariant>()
  let activeAssistantDraftId: string | null = null
  let activeAssistantDraftKind: DraftAssistantMessageKind | null = null
  let reasoningDraftAssistantId: string | null = null
  let assistantDraftCount = 0

  const removeInsertedMessages = () => {
    for (const messageId of insertedMessageIds) {
      input.removeLocalMessage(input.conversationId, messageId)
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
  ) => {
    const nextValue = updater(getDraftAssistantMessage(draftAssistantId))
    draftAssistantMessages.set(draftAssistantId, nextValue)
    input.updateLocalMessage(input.conversationId, draftAssistantId, () => nextValue)
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
      (draftAssistantMessage.reasoningContent ?? '').trim().length === 0
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
      | Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName'>
      | Pick<ToolInvocationTrace, 'argumentsText' | 'completedAt' | 'resultContent' | 'resultPresentation' | 'toolName'>,
  ) => {
    updateDraftAssistantMessage(draftAssistantId, (message) => ({
      ...message,
      toolInvocations: upsertToolInvocation(message.toolInvocations ?? [], invocationId, (currentValue) =>
        buildToolInvocationState(invocationId, nextValue, currentValue, message, state),
      ),
    }))
  }

  return {
    appendPlaceholderDraft() {
      appendAssistantDraft('placeholder')
    },
    completeReasoningDraft,
    handleContentDelta(delta: string) {
      completeReasoningDraft()
      const draftAssistantId = ensureAssistantDraft('content')
      promoteWaitingIndicatorToSplash(draftAssistantId)
      input.markTextStreamingPulse(input.conversationId)
      updateDraftAssistantMessage(draftAssistantId, (message) => ({
        ...message,
        content: message.content + delta,
      }))
    },
    handleReasoningDelta(delta: string) {
      const draftAssistantId = ensureAssistantDraft('content')
      reasoningDraftAssistantId = draftAssistantId
      promoteWaitingIndicatorToSplash(draftAssistantId)
      input.markTextStreamingPulse(input.conversationId)
      updateDraftAssistantMessage(draftAssistantId, (message) => ({
        ...message,
        reasoningContent: (message.reasoningContent ?? '') + delta,
      }))
    },
    handleSyntheticToolMessage(syntheticMessage: Message) {
      input.appendLocalMessage(input.conversationId, syntheticMessage)
      insertedMessageIds.push(syntheticMessage.id)
      streamedMessageOrder.push({
        kind: 'message',
        message: syntheticMessage,
      })
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
      updateToolInvocation(draftAssistantId, invocationId, 'completed', nextValue)
    },
    handleToolInvocationDelta(
      invocationId: string,
      nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'toolName'>,
    ) {
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = toolInvocationMessageIds.get(invocationId) ?? ensureAssistantDraft('tool')
      toolInvocationMessageIds.set(invocationId, draftAssistantId)
      updateDraftAssistantMessage(draftAssistantId, (message) => ({
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
      updateToolInvocation(draftAssistantId, invocationId, 'failed', nextValue)
    },
    handleToolInvocationStarted(
      invocationId: string,
      nextValue: Pick<ToolInvocationTrace, 'argumentsText' | 'startedAt' | 'toolName'>,
    ) {
      completeReasoningDraft(nextValue.startedAt)
      input.stopTextStreaming(input.conversationId)
      const draftAssistantId = ensureAssistantDraft('tool')
      toolInvocationMessageIds.set(invocationId, draftAssistantId)
      updateToolInvocation(draftAssistantId, invocationId, 'running', nextValue)
    },
    finalizeStreamedMessages(wasAborted: boolean) {
      completeReasoningDraft()
      input.updateConversationRuntimeState(input.conversationId, {
        activeStreamId: null,
        streamingAssistantMessageId: null,
        streamingWaitingIndicatorVariant: null,
      })
      input.stopTextStreaming(input.conversationId)

      const streamedMessages = streamedMessageOrder.flatMap((entry) => {
        if (entry.kind === 'message') {
          return [entry.message]
        }

        const draftAssistantMessage = draftAssistantMessages.get(entry.id)
        if (!draftAssistantMessage || !hasMeaningfulAssistantOutput(draftAssistantMessage)) {
          return []
        }

        return [normalizeAssistantMessage(draftAssistantMessage)]
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
    removeInsertedMessages,
  }
}
