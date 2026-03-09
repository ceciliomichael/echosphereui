import { useCallback, useState } from 'react'
import type { ConversationFolderSummary, ConversationRecord, ConversationSummary, Message } from '../types/chat'
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
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearConversationSelection = useCallback((nextFolderId: string | null) => {
    setActiveConversationId(null)
    setSelectedFolderId(nextFolderId)
    setMessages([])
  }, [])

  const applyConversation = useCallback((conversation: ConversationRecord) => {
    setActiveConversationId(conversation.id)
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

  return {
    activeConversationId,
    activeConversationTitle:
      conversationSummaries.find((conversation) => conversation.id === activeConversationId)?.title ?? 'New thread',
    addFolder,
    applyConversation,
    applySavedConversation,
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
    isLoading,
    isSending,
    messages,
    replaceConversationSummaries: setConversationSummaries,
    selectedFolderId,
    selectedFolderName: getSelectedFolderName(folderSummaries, selectedFolderId),
    setError,
    setIsLoading,
    setIsSending,
  }
}
