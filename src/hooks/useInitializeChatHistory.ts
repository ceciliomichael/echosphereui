import { useEffect } from 'react'
import { loadInitialChatHistory } from './chatHistoryWorkflows'

interface UseInitializeChatHistoryInput {
  initializeHistory: (snapshot: Awaited<ReturnType<typeof loadInitialChatHistory>>) => void
  setError: (errorMessage: string | null) => void
  setIsLoading: (isLoading: boolean) => void
}

export function useInitializeChatHistory(input: UseInitializeChatHistoryInput) {
  const { initializeHistory, setError, setIsLoading } = input

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
}
