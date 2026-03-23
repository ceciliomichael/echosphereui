import type { Message } from '../../../src/types/chat'

export function buildReplayableMessageHistory(messages: Message[]) {
  return [...messages]
}
