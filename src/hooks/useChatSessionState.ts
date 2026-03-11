import { useCallback, useState } from 'react'
import type { ChatMode, ConversationFolderSummary, ConversationRecord, ConversationSummary, Message } from '../types/chat'
import {
  buildConversationGroups,
  getSelectedFolderName,
  insertFolderSummary,
  removeConversationSummary,
  upsertConversationSummary,
} from './chatHistoryViewModels'
import type { ChatHistorySnapshot } from './chatHistoryWorkflows'
import type { AppLanguage } from '../lib/appSettings'

export function useChatSessionState(language: AppLanguage) {
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([])
  const [folderSummaries, setFolderSummaries] = useState<ConversationFolderSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [activeConversationChatMode, setActiveConversationChatMode] = useState<ChatMode | null>(null)
  const [activeConversationAgentContextRootPath, setActiveConversationAgentContextRootPath] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearConversationSelection = useCallback((nextFolderId: string | null) => {
    setActiveConversationId(null)
    setActiveConversationChatMode(null)
    setActiveConversationAgentContextRootPath(null)
    setSelectedFolderId(nextFolderId)
    setMessages([])
  }, [])

  const applyConversation = useCallback((conversation: ConversationRecord) => {
    setActiveConversationId(conversation.id)
    setActiveConversationChatMode(conversation.chatMode)
    setActiveConversationAgentContextRootPath(conversation.agentContextRootPath)
    setSelectedFolderId(conversation.folderId)
    setMessages(conversation.messages)
  }, [])

  const initializeHistory = useCallback(
    ({ conversationSummaries, folderSummaries, initialConversation }: ChatHistorySnapshot) => {
      setConversationSummaries(conversationSummaries)
      setFolderSummaries(folderSummaries)

      if (!initialConversation) {
        clearConversationSelection(null)
        return
      }

      applyConversation(initialConversation)
    },
    [applyConversation, clearConversationSelection],
  )

  const addFolder = useCallback((folder: ConversationFolderSummary) => {
    setFolderSummaries((currentValue) => insertFolderSummary(currentValue, folder))
  }, [])

  const applySavedConversation = useCallback(
    (conversation: ConversationRecord) => {
      setConversationSummaries((currentValue) => upsertConversationSummary(currentValue, conversation))
      applyConversation(conversation)
    },
    [applyConversation],
  )

  const updateConversationSummary = useCallback((conversation: ConversationRecord) => {
    setConversationSummaries((currentValue) => upsertConversationSummary(currentValue, conversation))
  }, [])

  const getDeletionContext = useCallback(
    (conversationId: string) => {
      return {
        deletedConversationFolderId:
          conversationSummaries.find((conversation) => conversation.id === conversationId)?.folderId ?? null,
        remainingSummaries: removeConversationSummary(conversationSummaries, conversationId),
      }
    },
    [conversationSummaries],
  )

  const clearError = useCallback(() => setError(null), [])
  const appendLocalMessage = useCallback((message: Message) => {
    setMessages((currentValue) => [...currentValue, message])
  }, [])
  const insertLocalMessagesBefore = useCallback((targetMessageId: string, nextMessages: Message[]) => {
    if (nextMessages.length === 0) {
      return
    }

    setMessages((currentValue) => {
      const targetMessageIndex = currentValue.findIndex((message) => message.id === targetMessageId)
      if (targetMessageIndex < 0) {
        return [...currentValue, ...nextMessages]
      }

      return [
        ...currentValue.slice(0, targetMessageIndex),
        ...nextMessages,
        ...currentValue.slice(targetMessageIndex),
      ]
    })
  }, [])
  const removeLocalMessage = useCallback((messageId: string) => {
    setMessages((currentValue) => currentValue.filter((message) => message.id !== messageId))
  }, [])
  const updateLocalMessage = useCallback((messageId: string, updater: (message: Message) => Message) => {
    setMessages((currentValue) =>
      currentValue.map((message) => (message.id === messageId ? updater(message) : message)),
    )
  }, [])

  return {
    activeConversationId,
    activeConversationAgentContextRootPath,
    activeConversationChatMode,
    activeConversationTitle:
      conversationSummaries.find((conversation) => conversation.id === activeConversationId)?.title ?? 'New thread',
    addFolder,
    applyConversation,
    applySavedConversation,
    appendLocalMessage,
    clearConversationSelection,
    clearError,
    conversationGroups: buildConversationGroups(
      folderSummaries,
      conversationSummaries,
      activeConversationId,
      selectedFolderId,
      language,
    ),
    error,
    getDeletionContext,
    initializeHistory,
    insertLocalMessagesBefore,
    isLoading,
    isSending,
    messages,
    replaceConversationSummaries: setConversationSummaries,
    removeLocalMessage,
    selectedFolderId,
    selectedFolderName: getSelectedFolderName(folderSummaries, selectedFolderId),
    setError,
    setIsLoading,
    setIsSending,
    updateConversationSummary,
    updateLocalMessage,
  }
}
