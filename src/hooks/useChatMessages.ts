import { useRef, useState } from 'react'
import type { ChatRuntimeSelection } from './chatMessageRuntime'
import { useChatComposerState } from './useChatComposerState'
import { useChatConversationActions } from './useChatConversationActions'
import { useChatSendActions } from './useChatSendActions'
import { useChatSessionState } from './useChatSessionState'
import { useChatStreamingState } from './useChatStreamingState'
import { useInitializeChatHistory } from './useInitializeChatHistory'
import type { AppLanguage } from '../lib/appSettings'
import type { ChatMode } from '../types/chat'

interface UseChatMessagesInput {
  language: AppLanguage
  preferredConversationId: string | null
}

export function useChatMessages(input: UseChatMessagesInput) {
  const initialPreferredConversationIdRef = useRef(input.preferredConversationId)
  const { language } = input
  const sessionState = useChatSessionState(language)
  const messages = sessionState.activeConversationState?.conversation.messages ?? []
  const isSending = sessionState.activeConversationState?.isSending ?? false
  const composerState = useChatComposerState(messages)
  const [draftChatMode, setDraftChatMode] = useState<ChatMode>('agent')
  const [pendingDraftSendCount, setPendingDraftSendCount] = useState(0)

  const streamingState = useChatStreamingState({
    activeConversationId: sessionState.activeConversationId,
    conversationRuntimeStates: sessionState.conversationRuntimeStates,
    selectedFolderId: sessionState.selectedFolderId,
    updateConversationRuntimeState: sessionState.updateConversationRuntimeState,
  })

  useInitializeChatHistory({
    initializeHistory: sessionState.initializeHistory,
    preferredConversationId: initialPreferredConversationIdRef.current,
    setError: sessionState.setError,
    setIsLoading: sessionState.setIsLoading,
  })

  const conversationActions = useChatConversationActions({
    activeConversationId: sessionState.activeConversationId,
    addFolder: sessionState.addFolder,
    applyConversation: sessionState.applyConversation,
    beginEditingMessage: composerState.startEditingMessage,
    clearConversationSelection: sessionState.clearConversationSelection,
    clearError: sessionState.clearError,
    conversationRuntimeStatesRef: streamingState.conversationRuntimeStatesRef,
    getDeletionContext: sessionState.getDeletionContext,
    removeConversationRuntime: sessionState.removeConversationRuntime,
    replaceConversationSummaries: sessionState.replaceConversationSummaries,
    resetComposerState: composerState.resetComposerState,
    selectedFolderId: sessionState.selectedFolderId,
    setError: sessionState.setError,
  })

  const sendActions = useChatSendActions({
    activeConversationId: sessionState.activeConversationId,
    activeConversationIdRef: streamingState.activeConversationIdRef,
    activeConversationStateIsSending: isSending,
    applyConversation: sessionState.applyConversation,
    appendLocalMessage: sessionState.appendLocalMessage,
    beginEditingMessage: composerState.startEditingMessage,
    cancelEditingMessage: composerState.cancelEditingMessage,
    clearError: sessionState.clearError,
    clearTextStreamingIdleTimeout: streamingState.clearTextStreamingIdleTimeout,
    conversationRuntimeStatesRef: streamingState.conversationRuntimeStatesRef,
    draftChatMode,
    editComposerAttachments: composerState.editComposerAttachments,
    editComposerValue: composerState.editComposerValue,
    editingMessageId: composerState.editingMessageId,
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

  const isActiveDraftSending = sessionState.activeConversationId === null && pendingDraftSendCount > 0

  return {
    activeConversationId: sessionState.activeConversationId,
    activeConversationRootPath: sessionState.activeConversationState?.conversation.agentContextRootPath ?? null,
    activeConversationTitle: sessionState.activeConversationTitle,
    cancelEditingMessage: composerState.cancelEditingMessage,
    conversationGroups: sessionState.conversationGroups,
    createConversation: conversationActions.createConversation,
    createFolder: conversationActions.createFolder,
    deleteConversation: conversationActions.deleteConversation,
    editComposerAttachments: composerState.editComposerAttachments,
    editComposerFocusSignal: composerState.editComposerFocusSignal,
    editComposerValue: composerState.editComposerValue,
    editingMessageId: composerState.editingMessageId,
    error: sessionState.error,
    isEditingMessage: composerState.editingMessageId !== null,
    isEditComposerDirty: composerState.isEditComposerDirty,
    isLoading: sessionState.isLoading,
    isSending: sessionState.activeConversationState?.isSending ?? isActiveDraftSending,
    isStreamingResponse: sessionState.activeConversationState?.isSending ?? isActiveDraftSending,
    isStreamingTextActive: sessionState.activeConversationState?.isStreamingTextActive ?? false,
    mainComposerAttachments: composerState.mainComposerAttachments,
    mainComposerValue: composerState.mainComposerValue,
    messages,
    selectedChatMode: draftChatMode,
    selectedFolderName: sessionState.selectedFolderName,
    selectedFolderPath: sessionState.selectedFolderPath,
    selectConversation: conversationActions.selectConversation,
    selectFolder: conversationActions.selectFolder,
    setEditComposerAttachments: composerState.setEditComposerAttachments,
    setEditComposerValue: composerState.setEditComposerValue,
    setMainComposerAttachments: composerState.setMainComposerAttachments,
    setMainComposerValue: composerState.setMainComposerValue,
    setSelectedChatMode: setDraftChatMode,
    startEditingMessage: conversationActions.startEditingMessage,
    streamingAssistantMessageId: sessionState.activeConversationState?.streamingAssistantMessageId ?? null,
    streamingWaitingIndicatorVariant: sessionState.activeConversationState?.streamingWaitingIndicatorVariant ?? null,
    abortStreamingResponse: sendActions.abortStreamingResponse,
    revertUserMessage: sendActions.revertUserMessage,
    sendEditedMessage: sendActions.sendEditedMessage,
    sendNewMessage: sendActions.sendNewMessage,
  }
}

export type ChatMessagesController = ReturnType<typeof useChatMessages>
export type { ChatRuntimeSelection }
