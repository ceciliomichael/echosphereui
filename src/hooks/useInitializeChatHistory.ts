import { useEffect } from 'react'
import { loadGitBranchState, prefetchGitBranchStates } from '../lib/gitBranchStateCache'
import { loadInitialChatHistory } from './chatHistoryWorkflows'

interface UseInitializeChatHistoryInput {
  initializeHistory: (snapshot: Awaited<ReturnType<typeof loadInitialChatHistory>>) => void
  preferredConversationId: string | null
  setError: (errorMessage: string | null) => void
  setIsLoading: (isLoading: boolean) => void
}

export function useInitializeChatHistory(input: UseInitializeChatHistoryInput) {
  const { initializeHistory, preferredConversationId, setError, setIsLoading } = input

  useEffect(() => {
    let isMounted = true

    async function initializeConversations() {
      try {
        const snapshot = await loadInitialChatHistory(preferredConversationId)
        const initialWorkspacePath = snapshot.initialConversation?.agentContextRootPath ?? null

        if (initialWorkspacePath) {
          await loadGitBranchState(initialWorkspacePath).catch(() => undefined)
        }

        if (!isMounted) {
          return
        }

        initializeHistory(snapshot)
        void prefetchGitBranchStates([
          ...snapshot.folderSummaries.map((folderSummary) => folderSummary.path),
          ...snapshot.conversationSummaries.map((conversationSummary) => conversationSummary.agentContextRootPath),
        ])
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
  }, [initializeHistory, preferredConversationId, setError, setIsLoading])
}
