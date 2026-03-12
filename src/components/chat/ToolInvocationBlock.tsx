import { memo, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolInvocationTrace } from '../../types/chat'
import { CodeBlock } from './CodeBlock'
import { DiffViewer } from './DiffViewer'
import { MarkdownRenderer } from './MarkdownRenderer'
import { PathLabel } from './PathLabel'
import { getToolInvocationHeaderLabel } from './toolInvocationPresentation'
import { getPathBasename } from '../../lib/pathPresentation'

interface ToolInvocationBlockProps {
  invocation: ToolInvocationTrace
}

interface ReadToolResultViewModel {
  code: string
  endLineNumber: number
  filePath: string
  language?: string
  startLineNumber: number
}

function parseReadToolResult(resultContent: string): ReadToolResultViewModel | null {
  const match = resultContent.match(/^File (.+) \(lines (\d+)-(\d+)\)\n```([^\n]*)\n([\s\S]*)\n```$/u)
  if (!match) {
    return null
  }

  return {
    code: match[5],
    endLineNumber: Number.parseInt(match[3], 10),
    filePath: match[1],
    language: match[4].trim().length > 0 ? match[4].trim() : undefined,
    startLineNumber: Number.parseInt(match[2], 10),
  }
}

const MIN_RUNNING_LABEL_DURATION_MS = 200

function renderDiffCountSummary(invocation: ToolInvocationTrace) {
  if (invocation.state !== 'completed' || invocation.resultPresentation?.kind !== 'file_diff') {
    return null
  }

  const { addedLineCount = 0, removedLineCount = 0 } = invocation.resultPresentation

  if (addedLineCount > 0 && removedLineCount > 0) {
    return (
      <>
        <span className="text-emerald-500">{`+${addedLineCount}`}</span>
        <span className="text-red-500">{`-${removedLineCount}`}</span>
      </>
    )
  }

  if (addedLineCount > 0) {
    return <span className="text-emerald-500">{`+${addedLineCount}`}</span>
  }

  if (removedLineCount > 0) {
    return <span className="text-red-500">{`-${removedLineCount}`}</span>
  }

  return null
}

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
  const diffCountSummary = renderDiffCountSummary(invocation)
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
        <span className={`inline-flex items-center gap-1.5 ${displayedState === 'running' ? 'thinking-shimmer' : ''}`}>
          <span>{headerLabel}</span>
          {diffCountSummary ? <span className="inline-flex items-center gap-1">{diffCountSummary}</span> : null}
        </span>
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
              filePath={diffResultPresentation.fileName}
              isStreaming={invocation.state === 'running'}
              newContent={diffResultPresentation.newContent}
              oldContent={diffResultPresentation.oldContent}
              startLineNumber={diffResultPresentation.startLineNumber}
            />
          ) : readResultPresentation ? (
            <div className="w-full text-left">
              <p className="my-0 mb-1.5 flex min-w-0 items-baseline gap-1 text-[15px] leading-[1.52] text-foreground">
                <span className="shrink-0">File</span>
                <PathLabel path={readResultPresentation.filePath} className="flex-1 text-left" />
                <span className="shrink-0">
                  (lines {readResultPresentation.startLineNumber}-{readResultPresentation.endLineNumber})
                </span>
              </p>
              <CodeBlock
                code={readResultPresentation.code}
                fileName={getPathBasename(readResultPresentation.filePath)}
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
