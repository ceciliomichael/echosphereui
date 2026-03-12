import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import { buildCodexGroupedToolResultContent } from './toolResultFormatter'

function createSyntheticToolResultMessage(toolContents: string[], timestamp: number): Message | null {
  const groupedContent = buildCodexGroupedToolResultContent(toolContents)
  if (!groupedContent) {
    return null
  }

  return {
    content: groupedContent,
    id: randomUUID(),
    role: 'user',
    timestamp,
    userMessageKind: 'tool_result',
  }
}

export function buildReplayableMessageHistory(messages: Message[]) {
  const replayableMessages: Message[] = []
  const pendingToolContents: string[] = []
  let pendingToolTimestamp = 0

  const flushPendingToolContents = () => {
    const syntheticMessage = createSyntheticToolResultMessage(pendingToolContents, pendingToolTimestamp)
    pendingToolContents.length = 0
    pendingToolTimestamp = 0

    if (!syntheticMessage) {
      return
    }

    replayableMessages.push(syntheticMessage)
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      if (message.content.trim().length > 0) {
        pendingToolContents.push(message.content)
        pendingToolTimestamp = message.timestamp
      }
      continue
    }

    flushPendingToolContents()
    replayableMessages.push(message)
  }

  flushPendingToolContents()
  return replayableMessages
}
