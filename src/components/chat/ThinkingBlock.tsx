import { memo, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ThinkingBlockProps {
  content: string
  isComplete: boolean
  reasoningCompletedAt?: number
  startTime: number
}

function normalizeMarkdownText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
}

function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${seconds.toFixed(2)}s`
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
      setIsOpen(true)
      return
    }

    setIsOpen(false)
  }, [isReasoningComplete])

  const stableDuration = frozenDurationRef.current ?? reasoningDurationSeconds ?? elapsedSeconds
  const normalizedContent = normalizeMarkdownText(content)
  const completedDuration = stableDuration ?? 0
  const headerLabel = !isReasoningComplete
    ? stableDuration !== null
      ? `Thinking for ${formatDuration(stableDuration)}`
      : 'Thinking'
    : `Thought for ${formatDuration(completedDuration)}`

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className={!isComplete ? 'thinking-shimmer' : ''}>{headerLabel}</span>
        <ChevronRight
          className={[
            'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
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
