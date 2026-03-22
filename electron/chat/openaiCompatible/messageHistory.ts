import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import { buildCodexGroupedToolResultContent } from './toolResultFormatter'
import {
  ensureToolOutputMessageEnvelope,
  isHumanUserMessage,
  isReplayToolResultUserMessage,
  TOOL_RESULT_TO_USER_BRIDGE_TEXT,
} from './toolResultReplayEnvelope'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function createSyntheticToolResultMessage(content: string, timestamp: number): Message | null {
  const envelopedContent = ensureToolOutputMessageEnvelope(content)
  if (!hasText(envelopedContent)) {
    return null
  }

  return {
    content: envelopedContent,
    id: randomUUID(),
    role: 'user',
    timestamp: timestamp > 0 ? timestamp : Date.now(),
    userMessageKind: 'tool_result',
  }
}

function buildAssistantBridgeMessage(timestamp: number): Message {
  return {
    content: TOOL_RESULT_TO_USER_BRIDGE_TEXT,
    id: randomUUID(),
    role: 'assistant',
    timestamp: timestamp > 0 ? timestamp : Date.now(),
  }
}

function insertToolResultBridgeMessages(messages: Message[]) {
  if (messages.length <= 1) {
    return messages
  }

  const bridgedMessages: Message[] = []

  for (const message of messages) {
    const previousMessage = bridgedMessages.at(-1)
    if (previousMessage && isReplayToolResultUserMessage(previousMessage) && isHumanUserMessage(message)) {
      bridgedMessages.push(buildAssistantBridgeMessage(message.timestamp))
    }

    bridgedMessages.push(message)
  }

  return bridgedMessages
}

export function buildReplayableMessageHistory(messages: Message[]) {
  const replayableMessages: Message[] = []
  const pendingToolContentsByTurn: string[] = []
  let pendingToolTimestamp = 0

  const flushPendingToolContentsAsMessage = () => {
    const groupedContent = buildCodexGroupedToolResultContent(pendingToolContentsByTurn)
    pendingToolContentsByTurn.length = 0
    if (!groupedContent) {
      pendingToolTimestamp = 0
      return
    }

    const syntheticMessage = createSyntheticToolResultMessage(groupedContent, pendingToolTimestamp)
    pendingToolTimestamp = 0
    if (!syntheticMessage) {
      return
    }

    replayableMessages.push(syntheticMessage)
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      if (hasText(message.content)) {
        pendingToolContentsByTurn.push(message.content)
        pendingToolTimestamp = message.timestamp
      }
      continue
    }

    if (isReplayToolResultUserMessage(message)) {
      flushPendingToolContentsAsMessage()
      replayableMessages.push({
        ...message,
        content: ensureToolOutputMessageEnvelope(message.content),
      })
      continue
    }

    flushPendingToolContentsAsMessage()
    replayableMessages.push(message)
  }

  flushPendingToolContentsAsMessage()
  return insertToolResultBridgeMessages(replayableMessages)
}
