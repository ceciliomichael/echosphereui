import { useEffect, useRef } from 'react'
import { loadGitBranchState, prefetchGitBranchStates } from '../lib/gitBranchStateCache'
import { prefetchGitDiffSnapshots } from '../lib/gitDiffSnapshotCache'
import { loadInitialChatHistory } from './chatHistoryWorkflows'

interface UseInitializeChatHistoryInput {
  enabled: boolean
  initializeHistory: (snapshot: Awaited<ReturnType<typeof loadInitialChatHistory>>) => void
  preferredConversationId: string | null
  setError: (errorMessage: string | null) => void
  setIsLoading: (isLoading: boolean) => void
}

export function useInitializeChatHistory(input: UseInitializeChatHistoryInput) {
  const { enabled, initializeHistory, preferredConversationId, setError, setIsLoading } = input
  const didStartInitializationRef = useRef(false)

  useEffect(() => {
    if (!enabled || didStartInitializationRef.current) {
      return
    }

    didStartInitializationRef.current = true
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
        const workspacePaths = [
          ...snapshot.folderSummaries.map((folderSummary) => folderSummary.path),
          ...snapshot.conversationSummaries.map((conversationSummary) => conversationSummary.agentContextRootPath),
        ]
        void prefetchGitBranchStates(workspacePaths)
        void prefetchGitDiffSnapshots(workspacePaths)
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
  }, [enabled, initializeHistory, preferredConversationId, setError, setIsLoading])
}
