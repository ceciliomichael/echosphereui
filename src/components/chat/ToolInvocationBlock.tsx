import { memo, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolInvocationTrace } from '../../types/chat'
import { MarkdownRenderer } from './MarkdownRenderer'
import { getToolInvocationHeaderLabel } from './toolInvocationPresentation'

interface ToolInvocationBlockProps {
  invocation: ToolInvocationTrace
}

export const ToolInvocationBlock = memo(function ToolInvocationBlock({ invocation }: ToolInvocationBlockProps) {
  const [isOpen, setIsOpen] = useState(invocation.state === 'running')

  useEffect(() => {
    if (invocation.state === 'running') {
      setIsOpen(true)
      return
    }

    setIsOpen(false)
  }, [invocation.state])

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{getToolInvocationHeaderLabel(invocation)}</span>
        <ChevronRight
          className={[
            'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
            isOpen ? 'rotate-90' : '',
          ].join(' ')}
        />
      </button>

      {isOpen ? (
        <div className="mt-1.5 text-sm text-muted-foreground/90">
          {invocation.resultContent ? (
            <MarkdownRenderer content={invocation.resultContent} className="opacity-85" isStreaming={invocation.state === 'running'} />
          ) : (
            <p className="italic text-subtle-foreground">Waiting for tool result...</p>
          )}
        </div>
      ) : null}
    </div>
  )
})
