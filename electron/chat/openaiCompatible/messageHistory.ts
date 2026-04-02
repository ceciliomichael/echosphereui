import type { Message } from '../../../src/types/chat'

function hasNonBlankToolCallId(message: Message) {
  return message.role === 'tool' && typeof message.toolCallId === 'string' && message.toolCallId.trim().length > 0
}

export function buildReplayableMessageHistory(messages: Message[]) {
  const seenToolMessageCallIds = new Set(
    messages
      .filter((message): message is Message & { role: 'tool'; toolCallId: string } => hasNonBlankToolCallId(message))
      .map((message) => message.toolCallId),
  )

  const replayableMessages: Message[] = []
  for (const message of messages) {
    if (message.role === 'assistant' && Array.isArray(message.toolInvocations) && message.toolInvocations.length > 0) {
      const filteredToolInvocations = message.toolInvocations.filter((invocation) => seenToolMessageCallIds.has(invocation.id))

      if (filteredToolInvocations.length === 0 && message.content.trim().length === 0) {
        continue
      }

      replayableMessages.push(
        filteredToolInvocations.length === message.toolInvocations.length
          ? message
          : {
              ...message,
              ...(filteredToolInvocations.length > 0 ? { toolInvocations: filteredToolInvocations } : {}),
            },
      )
      continue
    }

    replayableMessages.push(message)
  }

  return replayableMessages
}
