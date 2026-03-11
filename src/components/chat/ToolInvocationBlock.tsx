import { memo, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolInvocationTrace } from '../../types/chat'
import { MarkdownRenderer } from './MarkdownRenderer'
import { getToolInvocationHeaderLabel } from './toolInvocationPresentation'

interface ToolInvocationBlockProps {
  invocation: ToolInvocationTrace
}

const MIN_RUNNING_LABEL_DURATION_MS = 200

export const ToolInvocationBlock = memo(function ToolInvocationBlock({ invocation }: ToolInvocationBlockProps) {
  const [isOpen, setIsOpen] = useState(invocation.state === 'running')
  const [displayedState, setDisplayedState] = useState<ToolInvocationTrace['state']>(invocation.state)

  useEffect(() => {
    if (invocation.state === 'running') {
      setIsOpen(true)
      setDisplayedState('running')
      return undefined
    }

    const elapsedSinceStart = Date.now() - invocation.startedAt
    const remainingRunningLabelTime = Math.max(0, MIN_RUNNING_LABEL_DURATION_MS - elapsedSinceStart)

    if (remainingRunningLabelTime === 0) {
      setDisplayedState(invocation.state)
      setIsOpen(false)
      return undefined
    }

    setDisplayedState('running')
    const timeoutId = window.setTimeout(() => {
      setDisplayedState(invocation.state)
      setIsOpen(false)
    }, remainingRunningLabelTime)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [invocation.startedAt, invocation.state])

  const headerLabel = getToolInvocationHeaderLabel(invocation, displayedState)

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className={displayedState === 'running' ? 'thinking-shimmer' : ''}>{headerLabel}</span>
        <ChevronRight
          className={[
            'h-3.5 w-3.5 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100',
            isOpen ? 'rotate-90' : '',
          ].join(' ')}
        />
      </button>

      {isOpen && invocation.resultContent ? (
        <div className="mt-1.5 text-sm text-muted-foreground/90">
          <MarkdownRenderer content={invocation.resultContent} className="opacity-85" isStreaming={invocation.state === 'running'} />
        </div>
      ) : null}
    </div>
  )
})
