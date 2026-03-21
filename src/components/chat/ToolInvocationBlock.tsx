import { memo, useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ToolInvocationTrace } from '../../types/chat'
import { CodeBlock } from './CodeBlock'
import { DiffViewer } from './DiffViewer'
import { FileChangeDiffResult } from './FileChangeDiffResult'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TerminalToolResult } from './TerminalToolResult'
import { ToolDecisionRequestCard, type ToolDecisionSubmission } from './ToolDecisionRequestCard'
import { UpdatePlanResult } from './UpdatePlanResult'
import { parseUpdatePlanResultBody } from './updatePlanResultParser'
import { getToolInvocationHeaderLabel } from './toolInvocationPresentation'
import { getRelativeDisplayPath } from '../../lib/pathPresentation'
import { parseStructuredToolResultContent } from '../../lib/toolResultContent'

interface ToolInvocationBlockProps {
  invocation: ToolInvocationTrace
  onToolDecisionSubmit?: (
    invocation: ToolInvocationTrace,
    submission: ToolDecisionSubmission,
  ) => void
  workspaceRootPath?: string | null
}

interface ReadToolResultViewModel {
  code: string
  endLineNumber: number
  filePath: string
  language?: string
  startLineNumber: number
}

function formatReadLineRangeLabel(startLineNumber: number, endLineNumber: number) {
  return `${startLineNumber}-${endLineNumber}`
}

function parseReadToolResult(resultContent: string): ReadToolResultViewModel | null {
  const match = resultContent.match(/^File (.+) \(lines (\d+)-(\d+)(?: of \d+)?\)\n```([^\n]*)\n([\s\S]*)\n```$/u)
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

export const ToolInvocationBlock = memo(function ToolInvocationBlock({
  invocation,
  onToolDecisionSubmit,
  workspaceRootPath = null,
}: ToolInvocationBlockProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [submittedDecisionRequestKey, setSubmittedDecisionRequestKey] = useState<string | null>(null)
  const [displayedState, setDisplayedState] = useState<ToolInvocationTrace['state']>(invocation.state)
  const decisionRequestKey = invocation.decisionRequest
    ? [
        invocation.id,
        invocation.decisionRequest.streamId,
        invocation.decisionRequest.kind,
        invocation.decisionRequest.options.map((option) => option.id).join(','),
      ].join(':')
    : null

  useEffect(() => {
    const hasUnsubmittedDecisionRequest =
      decisionRequestKey !== null && decisionRequestKey !== submittedDecisionRequestKey
    const shouldAutoOpenReadyImplementCompletion =
      invocation.toolName === 'ready_implement' && invocation.state === 'completed' && submittedDecisionRequestKey === null

    if (hasUnsubmittedDecisionRequest || shouldAutoOpenReadyImplementCompletion) {
      setIsOpen(true)
    }
  }, [decisionRequestKey, invocation.state, invocation.toolName, submittedDecisionRequestKey])

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

  const hasPendingDecision = invocation.decisionRequest !== undefined
  const isRunning = displayedState === 'running'
  const disableHeaderToggle = isRunning && !hasPendingDecision
  const headerLabel = getToolInvocationHeaderLabel(invocation, displayedState, workspaceRootPath)
  const diffCountSummary = renderDiffCountSummary(invocation)
  const shouldPreserveLineBreaks = invocation.toolName !== 'read'
  const terminalToolName =
    invocation.toolName === 'exec_command' || invocation.toolName === 'write_stdin' ? invocation.toolName : null
  const diffResultPresentation = invocation.resultPresentation?.kind === 'file_diff' ? invocation.resultPresentation : null
  const fileChangeResultPresentation =
    invocation.resultPresentation?.kind === 'file_change_diff' ? invocation.resultPresentation : null
  const parsedStructuredResult = invocation.resultContent ? parseStructuredToolResultContent(invocation.resultContent) : null
  const resultBody =
    parsedStructuredResult?.body ??
    parsedStructuredResult?.metadata?.summary ??
    invocation.resultContent ??
    ''
  const readResultPresentation = invocation.toolName === 'read' ? parseReadToolResult(resultBody) : null
  const updatePlanResultPresentation = invocation.toolName === 'todo_write' ? parseUpdatePlanResultBody(resultBody) : null
  const readResultDisplayPath =
    workspaceRootPath && readResultPresentation
      ? getRelativeDisplayPath(workspaceRootPath, readResultPresentation.filePath)
      : readResultPresentation?.filePath

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={disableHeaderToggle}
        onClick={() => {
          if (disableHeaderToggle) {
            return
          }

          setIsOpen((currentValue) => !currentValue)
        }}
        className={[
          'group flex items-center gap-1 text-sm text-muted-foreground transition-colors',
          disableHeaderToggle ? 'cursor-default opacity-90' : 'hover:text-foreground',
        ].join(' ')}
      >
        <span className={`inline-flex items-center gap-1.5 ${isRunning ? 'thinking-shimmer' : ''}`}>
          <span>{headerLabel}</span>
          {diffCountSummary ? <span className="inline-flex items-center gap-1">{diffCountSummary}</span> : null}
        </span>
        {!disableHeaderToggle ? (
          <ChevronRight
            className={[
              'h-3.5 w-3.5 shrink-0 opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100',
              isOpen ? 'rotate-90' : '',
            ].join(' ')}
          />
        ) : null}
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
              maxBodyHeightClassName="max-h-80"
            />
          ) : fileChangeResultPresentation ? (
            <FileChangeDiffResult parsedResult={fileChangeResultPresentation} />
          ) : readResultPresentation ? (
            <div className="w-full text-left">
              <CodeBlock
                code={readResultPresentation.code}
                fileName={readResultDisplayPath}
                headerRightLabel={formatReadLineRangeLabel(
                  readResultPresentation.startLineNumber,
                  readResultPresentation.endLineNumber,
                )}
                language={readResultPresentation.language}
                isStreaming={invocation.state === 'running'}
                startLineNumber={readResultPresentation.startLineNumber}
                maxBodyHeightClassName="max-h-80"
                showCopyButton={false}
              />
            </div>
          ) : updatePlanResultPresentation ? (
            <UpdatePlanResult parsedResult={updatePlanResultPresentation} />
          ) : terminalToolName ? (
            <TerminalToolResult
              content={resultBody}
              isStreaming={invocation.state === 'running'}
              toolName={terminalToolName}
            />
          ) : (
            <MarkdownRenderer
              content={resultBody}
              className="w-full opacity-85"
              isStreaming={invocation.state === 'running'}
              preserveLineBreaks={shouldPreserveLineBreaks}
            />
          )}
        </div>
      ) : null}

      {isOpen && invocation.decisionRequest ? (
        <div className="mt-1.5 w-full text-sm text-muted-foreground/90">
          <ToolDecisionRequestCard
            onSubmit={(submission) => {
              if (!onToolDecisionSubmit) {
                return
              }

              setIsOpen(false)
              if (decisionRequestKey) {
                setSubmittedDecisionRequestKey(decisionRequestKey)
              }
              onToolDecisionSubmit(invocation, submission)
            }}
            request={invocation.decisionRequest}
          />
        </div>
      ) : null}
    </div>
  )
})
