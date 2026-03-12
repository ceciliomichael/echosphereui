import { useEffect, useState } from 'react'
import type { AssistantWaitingIndicatorVariant } from '../../types/chat'

const SPLASH_MESSAGES = [
  'I am working on it',
  'Almost there',
  'Still working on your request',
  'Finishing this up',
] as const

const MESSAGE_ROTATION_INTERVAL_MS = 5000

interface ThinkingIndicatorProps {
  variant?: AssistantWaitingIndicatorVariant
}

export function ThinkingIndicator({ variant = 'thinking' }: ThinkingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    if (variant !== 'splash') {
      setMessageIndex(0)
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setMessageIndex((currentValue) => (currentValue + 1) % SPLASH_MESSAGES.length)
    }, MESSAGE_ROTATION_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [variant])

  const statusText = variant === 'splash' ? SPLASH_MESSAGES[messageIndex] : 'Thinking'

  return (
    <span
      className="thinking-shimmer text-sm font-medium"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={variant === 'splash' ? 'Assistant is working' : 'Assistant is thinking'}
    >
      {statusText}
    </span>
  )
}
