import { memo, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { normalizeMarkdownText } from '../../lib/chatMessageContent'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ThinkingBlockProps {
  content: string
  isComplete: boolean
  reasoningCompletedAt?: number
  startTime: number
}

function formatDuration(seconds: number): string {
  const normalizedSeconds = Math.max(seconds, 0.01)

  if (normalizedSeconds >= 60) {
    const minutes = Math.floor(normalizedSeconds / 60)
    const remainingSeconds = Math.round(normalizedSeconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${normalizedSeconds.toFixed(2)}s`
}

export const ThinkingBlock = memo(function ThinkingBlock({ content, isComplete, reasoningCompletedAt, startTime }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null)
  const frozenDurationRef = useRef<number | null>(null)
  const isReasoningComplete = typeof reasoningCompletedAt === 'number'
  const reasoningDurationSeconds =
    isReasoningComplete ? Math.max((reasoningCompletedAt - startTime) / 1000, 0) : null

  useEffect(() => {
    if (reasoningDurationSeconds !== null) {
      setElapsedSeconds(reasoningDurationSeconds)
      if (frozenDurationRef.current === null) {
        frozenDurationRef.current = reasoningDurationSeconds
      }

      return
    }

    if (!isComplete) {
      const intervalId = window.setInterval(() => {
        setElapsedSeconds((Date.now() - startTime) / 1000)
      }, 100)

      return () => {
        window.clearInterval(intervalId)
      }
    }

    if (frozenDurationRef.current === null) {
      frozenDurationRef.current = elapsedSeconds ?? 0
    }
  }, [elapsedSeconds, isComplete, reasoningDurationSeconds, startTime])

  useEffect(() => {
    if (!isReasoningComplete) {
      setIsOpen(!isComplete)
      return
    }

    setIsOpen(false)
  }, [isComplete, isReasoningComplete])

  const stableDuration = frozenDurationRef.current ?? reasoningDurationSeconds ?? elapsedSeconds
  const normalizedContent = normalizeMarkdownText(content)
  const completedDuration = stableDuration ?? 0
  const headerLabel = isReasoningComplete
    ? `Thought for ${formatDuration(completedDuration)}`
    : isComplete
      ? stableDuration !== null
        ? `Thought for ${formatDuration(stableDuration)}`
        : 'Thought'
      : stableDuration !== null
        ? `Thinking for ${formatDuration(stableDuration)}`
        : 'Thinking'

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className={!(isComplete || isReasoningComplete) ? 'thinking-shimmer' : ''}>{headerLabel}</span>
        <ChevronRight
          className={[
            'h-3.5 w-3.5 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100',
            isOpen ? 'rotate-90' : '',
          ].join(' ')}
        />
      </button>

      {isOpen ? (
        <div className="mt-1.5 text-sm text-muted-foreground/90">
          {normalizedContent.trim().length > 0 ? (
            <MarkdownRenderer content={normalizedContent} className="opacity-85" isStreaming={!isComplete} />
          ) : (
            <p className="italic text-subtle-foreground">Thinking...</p>
          )}
        </div>
      ) : null}
    </div>
  )
})
