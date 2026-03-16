import { useEffect, useState } from 'react'
import type { AssistantWaitingIndicatorVariant } from '../../types/chat'

const SPLASH_MESSAGES = [
  'I am working on it',
  'Almost there',
  'Still working on your request',
  'Finishing this up',
] as const

const MESSAGE_ROTATION_INTERVAL_MS = 5000
const RATE_LIMIT_ERROR_STAGE_MS = 1500
const RATE_LIMIT_RETRY_STAGE_MS = 1500

interface ThinkingIndicatorProps {
  variant?: AssistantWaitingIndicatorVariant
}

export function ThinkingIndicator({ variant = 'thinking' }: ThinkingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [effectiveVariant, setEffectiveVariant] = useState<Exclude<AssistantWaitingIndicatorVariant, 'rate_limit_retry'>>(
    variant === 'rate_limit_retry' ? 'thinking' : variant,
  )
  const [transientMessage, setTransientMessage] = useState<string | null>(null)

  useEffect(() => {
    setMessageIndex(0)

    if (variant !== 'rate_limit_retry') {
      setTransientMessage(null)
      setEffectiveVariant(variant)
      return undefined
    }

    setEffectiveVariant('thinking')
    setTransientMessage('Error 429')

    const retryStageTimeoutId = window.setTimeout(() => {
      setTransientMessage('Trying again')
    }, RATE_LIMIT_ERROR_STAGE_MS)

    const resumeSplashTimeoutId = window.setTimeout(() => {
      setTransientMessage(null)
      setEffectiveVariant('splash')
      setMessageIndex(0)
    }, RATE_LIMIT_ERROR_STAGE_MS + RATE_LIMIT_RETRY_STAGE_MS)

    return () => {
      window.clearTimeout(retryStageTimeoutId)
      window.clearTimeout(resumeSplashTimeoutId)
    }
  }, [variant])

  useEffect(() => {
    if (effectiveVariant !== 'splash') {
      setMessageIndex(0)
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setMessageIndex((currentValue) => (currentValue + 1) % SPLASH_MESSAGES.length)
    }, MESSAGE_ROTATION_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [effectiveVariant])

  const statusText = transientMessage ?? (effectiveVariant === 'splash' ? SPLASH_MESSAGES[messageIndex] : 'Thinking')
  const ariaLabel =
    transientMessage === 'Error 429'
      ? 'Assistant encountered a rate limit error'
      : transientMessage === 'Trying again'
        ? 'Assistant is trying again'
        : effectiveVariant === 'splash'
          ? 'Assistant is working'
          : 'Assistant is thinking'

  return (
    <span
      className="thinking-shimmer text-sm font-medium"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={ariaLabel}
    >
      {statusText}
    </span>
  )
}
