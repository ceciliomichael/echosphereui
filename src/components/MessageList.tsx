import { useEffect, useRef } from 'react'
import type { Message } from '../types/chat'
import { AssistantMessage } from './AssistantMessage'
import { UserMessage } from './UserMessage'

interface MessageListProps {
  messages: Message[]
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 space-y-4 overflow-y-auto py-6 scroll-smooth">
      {messages.map((msg) => (
        <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
          {msg.role === 'user' ? (
            <UserMessage content={msg.content} />
          ) : (
            <AssistantMessage content={msg.content} />
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
