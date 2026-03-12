import { memo, useMemo } from 'react'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'

function normalizeEscapedSequences(content: string) {
  if (!content) {
    return content
  }

  const hasActualNewlines = content.includes('\n')
  const hasEscapedSequences = /\\[ntr]/.test(content)

  if (!hasActualNewlines && hasEscapedSequences) {
    return content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  }

  return content
}

interface DiffViewerProps {
  contextLines?: number
  endLineNumber?: number
  fileName: string
  isStreaming?: boolean
  newContent: string
  oldContent: string | null | undefined
  startLineNumber?: number
  viewOnly?: boolean
}

interface DiffLine {
  collapsedCount?: number
  content: string
  lineNumber: number | null
  newLineNumber?: number
  oldLineNumber?: number
  type: 'added' | 'collapsed' | 'removed' | 'unchanged'
}

function computeDiff(oldContent: string | null | undefined, newContent: string, isStreaming = false, startLineNumber = 1) {
  const normalizedNewContent = normalizeEscapedSequences(newContent)
  const normalizedOldContent = oldContent ? normalizeEscapedSequences(oldContent) : oldContent

  if (normalizedOldContent === null || normalizedOldContent === undefined) {
    return normalizedNewContent.split('\n').map((line, index) => ({
      content: line,
      lineNumber: index + startLineNumber,
      newLineNumber: index + startLineNumber,
      oldLineNumber: undefined,
      type: 'added' as const,
    }))
  }

  const oldLines = normalizedOldContent.split('\n')
  const newLines = normalizedNewContent.split('\n')
  const diff: DiffLine[] = []

  let oldIndex = 0
  let newIndex = 0

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex]
    const newLine = newLines[newIndex]

    if (oldIndex >= oldLines.length) {
      diff.push({
        content: newLine,
        lineNumber: newIndex + startLineNumber,
        newLineNumber: newIndex + startLineNumber,
        oldLineNumber: undefined,
        type: 'added',
      })
      newIndex += 1
      continue
    }

    if (newIndex >= newLines.length) {
      if (!isStreaming) {
        diff.push({
          content: oldLine,
          lineNumber: oldIndex + startLineNumber,
          newLineNumber: undefined,
          oldLineNumber: oldIndex + startLineNumber,
          type: 'removed',
        })
      }
      oldIndex += 1
      continue
    }

    if (oldLine === newLine) {
      diff.push({
        content: oldLine,
        lineNumber: oldIndex + startLineNumber,
        newLineNumber: newIndex + startLineNumber,
        oldLineNumber: oldIndex + startLineNumber,
        type: 'unchanged',
      })
      oldIndex += 1
      newIndex += 1
      continue
    }

    const foundInOld = oldLines.slice(oldIndex + 1).indexOf(newLine)
    const foundInNew = newLines.slice(newIndex + 1).indexOf(oldLine)

    if (foundInOld !== -1 && (foundInNew === -1 || foundInOld <= foundInNew)) {
      diff.push({
        content: oldLine,
        lineNumber: oldIndex + startLineNumber,
        newLineNumber: undefined,
        oldLineNumber: oldIndex + startLineNumber,
        type: 'removed',
      })
      oldIndex += 1
      continue
    }

    if (foundInNew !== -1) {
      diff.push({
        content: newLine,
        lineNumber: newIndex + startLineNumber,
        newLineNumber: newIndex + startLineNumber,
        oldLineNumber: undefined,
        type: 'added',
      })
      newIndex += 1
      continue
    }

    diff.push({
      content: oldLine,
      lineNumber: oldIndex + startLineNumber,
      newLineNumber: undefined,
      oldLineNumber: oldIndex + startLineNumber,
      type: 'removed',
    })
    diff.push({
      content: newLine,
      lineNumber: newIndex + startLineNumber,
      newLineNumber: newIndex + startLineNumber,
      oldLineNumber: undefined,
      type: 'added',
    })
    oldIndex += 1
    newIndex += 1
  }

  return diff
}

function filterDiffWithContext(diffLines: DiffLine[], contextLines: number | undefined) {
  if (contextLines === undefined) {
    return diffLines
  }

  const changedIndices = new Set<number>()
  diffLines.forEach((line, index) => {
    if (line.type === 'added' || line.type === 'removed') {
      changedIndices.add(index)
    }
  })

  if (changedIndices.size === 0) {
    return diffLines
  }

  const includedIndices = new Set<number>()
  changedIndices.forEach((index) => {
    for (
      let currentIndex = Math.max(0, index - contextLines);
      currentIndex <= Math.min(diffLines.length - 1, index + contextLines);
      currentIndex += 1
    ) {
      includedIndices.add(currentIndex)
    }
  })

  const result: DiffLine[] = []
  let index = 0

  while (index < diffLines.length) {
    if (includedIndices.has(index)) {
      result.push(diffLines[index])
      index += 1
      continue
    }

    const collapsedStart = index
    while (index < diffLines.length && !includedIndices.has(index)) {
      index += 1
    }

    result.push({
      collapsedCount: index - collapsedStart,
      content: '',
      lineNumber: null,
      type: 'collapsed',
    })
  }

  return result
}

function getLineBackgroundClassName(line: DiffLine, viewOnly: boolean) {
  if (viewOnly || line.type === 'unchanged') {
    return 'bg-transparent'
  }

  if (line.type === 'added') {
    return 'bg-emerald-500/12'
  }

  if (line.type === 'removed') {
    return 'bg-red-500/12'
  }

  return 'bg-transparent'
}

const DiffViewerComponent = ({
  contextLines,
  endLineNumber,
  fileName,
  isStreaming = false,
  newContent,
  oldContent,
  startLineNumber = 1,
  viewOnly = false,
}: DiffViewerProps) => {
  const diffLines = useMemo(() => {
    const diff = computeDiff(oldContent, newContent, isStreaming, startLineNumber)
    return filterDiffWithContext(diff, contextLines)
  }, [contextLines, isStreaming, newContent, oldContent, startLineNumber])

  const iconConfig = resolveFileIconConfig({ fileName })
  const FileIcon = iconConfig.icon
  const hasOldSide = !viewOnly && diffLines.some((line) => line.type !== 'collapsed' && line.oldLineNumber !== undefined)

  return (
    <div className="my-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
        <span className="inline-flex min-h-4 min-w-0 items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center">
            <FileIcon size={14} style={{ color: iconConfig.color }} aria-hidden="true" />
          </span>
          <span className="truncate leading-[1] text-foreground">{fileName}</span>
        </span>
        {startLineNumber && endLineNumber ? (
          <span className="ml-2 shrink-0 leading-[1]">{startLineNumber}-{endLineNumber}</span>
        ) : null}
      </div>

      <div className="overflow-auto bg-surface text-[12px] leading-5">
        <div className="min-w-full w-fit">
          {diffLines.map((line, index) => {
            if (line.type === 'collapsed') {
              return (
                <div
                  key={`collapsed-${index}`}
                  className="border-y border-border bg-background/60 px-3 py-1.5 text-[11px] text-muted-foreground"
                >
                  {line.collapsedCount} unchanged lines
                </div>
              )
            }

            return (
              <div key={`${line.type}-${index}`} className={`flex min-h-5 ${getLineBackgroundClassName(line, viewOnly)}`}>
                <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-background/70 px-2 text-right text-subtle-foreground">
                  {viewOnly || !hasOldSide ? (
                    <span className="inline-block min-w-8">{line.newLineNumber ?? ''}</span>
                  ) : (
                    <>
                      <span className="inline-block min-w-8">{line.oldLineNumber ?? ''}</span>
                      <span className="mx-1 inline-block text-border">|</span>
                      <span className="inline-block min-w-8">{line.newLineNumber ?? ''}</span>
                    </>
                  )}
                </div>

                <pre className="m-0 flex-1 overflow-visible px-3 py-0 whitespace-pre text-foreground">
                  {line.content.length > 0 ? line.content : ' '}
                </pre>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const DiffViewer = memo(DiffViewerComponent)
