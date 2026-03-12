import { memo, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolInvocationTrace } from '../../types/chat'
import { CodeBlock } from './CodeBlock'
import { DiffViewer } from './DiffViewer'
import { MarkdownRenderer } from './MarkdownRenderer'
import { getToolInvocationHeaderLabel } from './toolInvocationPresentation'

interface ToolInvocationBlockProps {
  invocation: ToolInvocationTrace
}

interface ReadToolResultViewModel {
  code: string
  endLineNumber: number
  fileName: string
  language?: string
  startLineNumber: number
}

function getBasename(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  return pathSegments[pathSegments.length - 1] ?? filePath
}

function parseReadToolResult(resultContent: string): ReadToolResultViewModel | null {
  const match = resultContent.match(/^File (.+) \(lines (\d+)-(\d+)\)\n```([^\n]*)\n([\s\S]*)\n```$/u)
  if (!match) {
    return null
  }

  return {
    code: match[5],
    endLineNumber: Number.parseInt(match[3], 10),
    fileName: getBasename(match[1]),
    language: match[4].trim().length > 0 ? match[4].trim() : undefined,
    startLineNumber: Number.parseInt(match[2], 10),
  }
}

const MIN_RUNNING_LABEL_DURATION_MS = 200

export const ToolInvocationBlock = memo(function ToolInvocationBlock({ invocation }: ToolInvocationBlockProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [displayedState, setDisplayedState] = useState<ToolInvocationTrace['state']>(invocation.state)

  useEffect(() => {
    if (invocation.state === 'running') {
      setDisplayedState('running')
      return undefined
    }

    const elapsedSinceStart = Date.now() - invocation.startedAt
    const remainingRunningLabelTime = Math.max(0, MIN_RUNNING_LABEL_DURATION_MS - elapsedSinceStart)

    if (remainingRunningLabelTime === 0) {
      setDisplayedState(invocation.state)
      return undefined
    }

    setDisplayedState('running')
    const timeoutId = window.setTimeout(() => {
      setDisplayedState(invocation.state)
    }, remainingRunningLabelTime)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [invocation.startedAt, invocation.state])

  const headerLabel = getToolInvocationHeaderLabel(invocation, displayedState)
  const shouldPreserveLineBreaks = invocation.toolName !== 'read'
  const diffResultPresentation = invocation.resultPresentation?.kind === 'file_diff' ? invocation.resultPresentation : null
  const readResultPresentation =
    invocation.toolName === 'read' && invocation.resultContent ? parseReadToolResult(invocation.resultContent) : null

  return (
    <div className="w-full">
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
        <div className="mt-1.5 w-full text-sm text-muted-foreground/90">
          {diffResultPresentation ? (
            <DiffViewer
              contextLines={diffResultPresentation.contextLines}
              endLineNumber={diffResultPresentation.endLineNumber}
              fileName={getBasename(diffResultPresentation.fileName)}
              isStreaming={invocation.state === 'running'}
              newContent={diffResultPresentation.newContent}
              oldContent={diffResultPresentation.oldContent}
              startLineNumber={diffResultPresentation.startLineNumber}
            />
          ) : readResultPresentation ? (
            <div className="w-full text-left">
              <p className="my-0 mb-1.5 text-[15px] leading-[1.52] text-foreground">
                File {readResultPresentation.fileName} (lines {readResultPresentation.startLineNumber}-{readResultPresentation.endLineNumber})
              </p>
              <CodeBlock
                code={readResultPresentation.code}
                fileName={readResultPresentation.fileName}
                language={readResultPresentation.language}
                isStreaming={invocation.state === 'running'}
              />
            </div>
          ) : (
            <MarkdownRenderer
              content={invocation.resultContent}
              className="w-full opacity-85"
              isStreaming={invocation.state === 'running'}
              preserveLineBreaks={shouldPreserveLineBreaks}
            />
          )}
        </div>
      ) : null}
    </div>
  )
})
