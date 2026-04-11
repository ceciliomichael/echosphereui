import type { ConversationEditSession, RevertEditSession } from '../types/chat'

export function mergeConversationEditSessions(
  editSessionsByConversation: Record<string, ConversationEditSession>,
  revertEditSessionsByConversation: Record<string, RevertEditSession>,
): Record<string, ConversationEditSession> {
  const nextValue: Record<string, ConversationEditSession> = {
    ...editSessionsByConversation,
  }

  for (const [conversationId, revertSession] of Object.entries(revertEditSessionsByConversation)) {
    if (conversationId in nextValue) {
      continue
    }

    nextValue[conversationId] = {
      messageId: revertSession.messageId,
    }
  }

  return nextValue
}

export function buildRevertSessionKey(conversationId: string, revertSession: RevertEditSession) {
  return `${conversationId}:${revertSession.messageId}:${revertSession.redoCheckpointId}`
}
