import { useCallback } from 'react'
import { persistAndStreamMessage } from './chatMessageSendWorkflow'
import type { ChatRuntimeSelection } from './chatMessageRuntime'
import type { PersistAndStreamMessageInput } from './chatMessageSendTypes'

interface UseChatSendActionsInput extends Omit<PersistAndStreamMessageInput, 'runtimeSelection' | 'targetEditMessageId' | 'trimmedText' | 'attachments'> {
  activeConversationStateIsSending: boolean
  editComposerAttachments: PersistAndStreamMessageInput['attachments']
  editComposerValue: string
  editingMessageId: string | null
  mainComposerAttachments: PersistAndStreamMessageInput['attachments']
  mainComposerValue: string
  pendingDraftSendCount: number
}

export function useChatSendActions(input: UseChatSendActionsInput) {
  const sendNewMessage = useCallback(
    async (runtimeSelection: ChatRuntimeSelection) => {
      if (input.activeConversationStateIsSending || (input.activeConversationId === null && input.pendingDraftSendCount > 0)) {
        return
      }

      const trimmedText = input.mainComposerValue.trim()
      if (trimmedText.length === 0 && input.mainComposerAttachments.length === 0) {
        return
      }

      await persistAndStreamMessage({
        ...input,
        attachments: input.mainComposerAttachments,
        runtimeSelection,
        targetEditMessageId: null,
        trimmedText,
      })
    },
    [input],
  )

  const sendEditedMessage = useCallback(
    async (runtimeSelection: ChatRuntimeSelection) => {
      if (
        input.editingMessageId === null ||
        input.activeConversationStateIsSending ||
        (input.activeConversationId === null && input.pendingDraftSendCount > 0)
      ) {
        return
      }

      const trimmedText = input.editComposerValue.trim()
      if (trimmedText.length === 0 && input.editComposerAttachments.length === 0) {
        return
      }

      await persistAndStreamMessage({
        ...input,
        attachments: input.editComposerAttachments,
        runtimeSelection,
        targetEditMessageId: input.editingMessageId,
        trimmedText,
      })
    },
    [input],
  )

  const abortStreamingResponse = useCallback(async () => {
    if (!input.activeConversationId) {
      return
    }

    const streamId = input.conversationRuntimeStatesRef.current[input.activeConversationId]?.activeStreamId ?? null
    if (!streamId) {
      return
    }

    try {
      await window.echosphereChat.cancelStream(streamId)
    } catch (caughtError) {
      console.error(caughtError)
      input.setError('Unable to stop the current response.')
    }
  }, [input])

  return {
    abortStreamingResponse,
    sendEditedMessage,
    sendNewMessage,
  }
}
