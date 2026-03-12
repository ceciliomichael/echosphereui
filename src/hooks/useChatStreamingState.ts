import { useCallback, useEffect, useRef } from 'react'
import type { ConversationRuntimeStatePatch, ConversationRuntimeSnapshot } from './chatMessageSendTypes'

const TEXT_STREAM_IDLE_GRACE_MS = 1500

interface UseChatStreamingStateInput {
  activeConversationId: string | null
  conversationRuntimeStates: Record<string, ConversationRuntimeSnapshot>
  selectedFolderId: string | null
  updateConversationRuntimeState: (conversationId: string, input: ConversationRuntimeStatePatch) => void
}

export function useChatStreamingState(input: UseChatStreamingStateInput) {
  const { activeConversationId, conversationRuntimeStates, selectedFolderId, updateConversationRuntimeState } = input
  const activeConversationIdRef = useRef<string | null>(input.activeConversationId)
  const selectedFolderIdRef = useRef<string | null>(input.selectedFolderId)
  const conversationRuntimeStatesRef = useRef(input.conversationRuntimeStates)
  const textStreamingIdleTimeoutRef = useRef<Record<string, number>>({})

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    selectedFolderIdRef.current = selectedFolderId
  }, [selectedFolderId])

  useEffect(() => {
    conversationRuntimeStatesRef.current = conversationRuntimeStates
  }, [conversationRuntimeStates])

  const clearTextStreamingIdleTimeout = useCallback((conversationId: string) => {
    const timeoutId = textStreamingIdleTimeoutRef.current[conversationId]
    if (timeoutId === undefined) {
      return
    }

    window.clearTimeout(timeoutId)
    delete textStreamingIdleTimeoutRef.current[conversationId]
  }, [])

  const stopTextStreaming = useCallback(
    (conversationId: string) => {
      clearTextStreamingIdleTimeout(conversationId)
      updateConversationRuntimeState(conversationId, {
        isStreamingTextActive: false,
      })
    },
    [clearTextStreamingIdleTimeout, updateConversationRuntimeState],
  )

  const markTextStreamingPulse = useCallback(
    (conversationId: string) => {
      updateConversationRuntimeState(conversationId, {
        isStreamingTextActive: true,
      })
      clearTextStreamingIdleTimeout(conversationId)
      textStreamingIdleTimeoutRef.current[conversationId] = window.setTimeout(() => {
        delete textStreamingIdleTimeoutRef.current[conversationId]
        updateConversationRuntimeState(conversationId, {
          isStreamingTextActive: false,
        })
      }, TEXT_STREAM_IDLE_GRACE_MS)
    },
    [clearTextStreamingIdleTimeout, updateConversationRuntimeState],
  )

  useEffect(
    () => () => {
      for (const timeoutId of Object.values(textStreamingIdleTimeoutRef.current)) {
        window.clearTimeout(timeoutId)
      }

      textStreamingIdleTimeoutRef.current = {}
    },
    [],
  )

  return {
    activeConversationIdRef,
    clearTextStreamingIdleTimeout,
    conversationRuntimeStatesRef,
    markTextStreamingPulse,
    selectedFolderIdRef,
    stopTextStreaming,
  }
}
