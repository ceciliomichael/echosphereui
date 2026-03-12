import { useEffect, useState } from 'react'
import type { ChatMode, ChatProviderId, ContextUsageEstimate, Message } from '../types/chat'

const EMPTY_CONTEXT_USAGE: ContextUsageEstimate = {
  historyTokens: 0,
  maxTokens: 200_000,
  systemPromptTokens: 0,
  toolResultsTokens: 0,
  totalTokens: 0,
}

interface UseChatContextUsageInput {
  agentContextRootPath: string | null
  chatMode: ChatMode
  messages: Message[]
  providerId: ChatProviderId | null
}

export function useChatContextUsage({
  agentContextRootPath,
  chatMode,
  messages,
  providerId,
}: UseChatContextUsageInput) {
  const [usage, setUsage] = useState<ContextUsageEstimate>(EMPTY_CONTEXT_USAGE)

  useEffect(() => {
    if (!providerId) {
      setUsage(EMPTY_CONTEXT_USAGE)
      return
    }

    let isCancelled = false
    const timeoutId = window.setTimeout(() => {
      void window.echosphereChat
        .estimateContextUsage({
          agentContextRootPath,
          chatMode,
          messages,
          providerId,
        })
        .then((nextUsage) => {
          if (!isCancelled) {
            setUsage(nextUsage)
          }
        })
        .catch((error) => {
          console.error('Failed to estimate chat context usage', error)
        })
    }, 120)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [agentContextRootPath, chatMode, messages, providerId])

  return usage
}
