import { persistAssistantTurn, persistUserTurn } from './chatHistoryWorkflows'
import { createChatAssistantDraftManager } from './chatAssistantDrafts'
import { streamAssistantResponse, toErrorMessage } from './chatMessageRuntime'
import type { PersistAndStreamMessageInput } from './chatMessageSendTypes'

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

export async function persistAndStreamMessage(input: PersistAndStreamMessageInput) {
  const providerId = validateRuntimeSelection(input)
  if (!providerId) {
    return
  }

  const initiatingConversationId = input.activeConversationId
  const initiatingFolderId = input.selectedFolderId
  let conversationIdForCleanup = initiatingConversationId
  let draftManager: ReturnType<typeof createChatAssistantDraftManager> | null = null

  input.clearError()

  if (initiatingConversationId) {
    input.updateConversationRuntimeState(initiatingConversationId, {
      isSending: true,
    })
  } else {
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

    conversationIdForCleanup = conversation.id
    const shouldKeepSelected =
      initiatingConversationId === null
        ? input.activeConversationIdRef.current === null && input.selectedFolderIdRef.current === initiatingFolderId
        : input.activeConversationIdRef.current === conversation.id

    input.upsertConversation(conversation)
    input.updateConversationRuntimeState(conversation.id, {
      isSending: true,
    })

    if (shouldKeepSelected) {
      input.applyConversation(conversation)
    }

    if (input.targetEditMessageId !== null) {
      if (shouldKeepSelected) {
        input.cancelEditingMessage()
      }
    } else if (shouldKeepSelected) {
      input.setMainComposerValue('')
      input.setMainComposerAttachments([])
    }

    draftManager = createChatAssistantDraftManager({
      appendLocalMessage: input.appendLocalMessage,
      conversationId: conversation.id,
      markTextStreamingPulse: input.markTextStreamingPulse,
      providerId,
      removeLocalMessage: input.removeLocalMessage,
      runtimeSelection: input.runtimeSelection,
      stopTextStreaming: input.stopTextStreaming,
      updateConversationRuntimeState: input.updateConversationRuntimeState,
      updateLocalMessage: input.updateLocalMessage,
    })

    draftManager.appendPlaceholderDraft()
    const streamedAssistant = await streamAssistantResponse({
      agentContextRootPath: conversation.agentContextRootPath,
      chatMode: conversation.chatMode,
      messages: conversation.messages,
      modelId: input.runtimeSelection.modelId,
      onContentDelta: draftManager.handleContentDelta,
      onReasoningDelta: draftManager.handleReasoningDelta,
      onStreamStarted: draftManager.handleStreamStarted,
      onSyntheticToolMessage: draftManager.handleSyntheticToolMessage,
      onToolInvocationCompleted: draftManager.handleToolInvocationCompleted,
      onToolInvocationDelta: draftManager.handleToolInvocationDelta,
      onToolInvocationFailed: draftManager.handleToolInvocationFailed,
      onToolInvocationStarted: draftManager.handleToolInvocationStarted,
      providerId,
      reasoningEffort: input.runtimeSelection.reasoningEffort,
    })

    const streamedMessages = draftManager.finalizeStreamedMessages(streamedAssistant.wasAborted)
    if (streamedMessages === null) {
      return
    }

    for (const message of streamedMessages) {
      if (message.role !== 'assistant') {
        continue
      }

      input.updateLocalMessage(conversation.id, message.id, () => message)
    }

    if (!(conversation.id in input.conversationRuntimeStatesRef.current)) {
      return
    }

    const savedConversation = await persistAssistantTurn(conversation.id, streamedMessages)
    if (!(savedConversation.id in input.conversationRuntimeStatesRef.current)) {
      return
    }

    input.upsertConversation(savedConversation)
    input.updateConversationSummary(savedConversation)
  } catch (caughtError) {
    console.error(caughtError)
    if (draftManager) {
      draftManager.removeInsertedMessages()
    }

    const providerLabel = input.runtimeSelection.providerLabel ?? 'the selected provider'
    input.setError(toErrorMessage(caughtError, `Unable to get a response from ${providerLabel} right now.`))
  } finally {
    if (initiatingConversationId === null) {
      input.setPendingDraftSendCount((currentValue) => Math.max(0, currentValue - 1))
    }

    if (conversationIdForCleanup) {
      input.updateConversationRuntimeState(conversationIdForCleanup, {
        activeStreamId: null,
        isSending: false,
        isStreamingTextActive: false,
        streamingAssistantMessageId: null,
        streamingWaitingIndicatorVariant: null,
      })
      input.clearTextStreamingIdleTimeout(conversationIdForCleanup)
    }
  }
}
