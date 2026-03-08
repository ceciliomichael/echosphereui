import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { Message } from '../types/chat'

const TEST_ASSISTANT_REPLY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

export function useChatMessages() {
  const [messages, setMessages] = useState<Message[]>([])

  function sendMessage(text: string) {
    const timestamp = Date.now()

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp,
    }

    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: TEST_ASSISTANT_REPLY,
      timestamp: timestamp + 1,
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
  }

  return {
    messages,
    sendMessage,
  }
}
