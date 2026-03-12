import { memo, useMemo } from 'react'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { computeDiffLines, type DiffLine } from '../../lib/textDiff'
import { PathLabel } from './PathLabel'

interface DiffViewerProps {
  contextLines?: number
  filePath: string
  isStreaming?: boolean
  newContent: string
  oldContent: string | null | undefined
  startLineNumber?: number
  viewOnly?: boolean
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

function getLineContentClassName(line: DiffLine, viewOnly: boolean) {
  if (viewOnly || line.type === 'unchanged') {
    return 'bg-transparent text-foreground'
  }

  if (line.type === 'added') {
    return 'bg-emerald-500/18 text-emerald-950 dark:bg-emerald-500/24 dark:text-emerald-50'
  }

  if (line.type === 'removed') {
    return 'bg-red-500/18 text-red-950 dark:bg-red-500/24 dark:text-red-50'
  }

  return 'bg-transparent text-foreground'
}

function getLineGutterClassName() {
  return 'bg-surface text-muted-foreground'
}

function getLineNumberDividerClassName() {
  return 'bg-border/80'
}

const DiffViewerComponent = ({
  contextLines,
  filePath,
  isStreaming = false,
  newContent,
  oldContent,
  startLineNumber = 1,
  viewOnly = false,
}: DiffViewerProps) => {
  const diffLines = useMemo(() => {
    const diff = computeDiffLines(oldContent, newContent, { isStreaming, startLineNumber })
    return filterDiffWithContext(diff, contextLines)
  }, [contextLines, isStreaming, newContent, oldContent, startLineNumber])

  const iconConfig = resolveFileIconConfig({ fileName: filePath })
  const FileIcon = iconConfig.icon
  const hasOldSide = !viewOnly && diffLines.some((line) => line.type !== 'collapsed' && line.oldLineNumber !== undefined)

  return (
    <div className="my-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
        <span className="inline-flex min-h-4 min-w-0 items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center">
            <FileIcon size={14} style={{ color: iconConfig.color }} aria-hidden="true" />
          </span>
          <PathLabel path={filePath} className="min-w-0 leading-[1] text-foreground" />
        </span>
      </div>

      <div className="overflow-auto bg-surface font-mono text-[12px] leading-5">
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
              <div key={`${line.type}-${index}`} className="flex min-h-5 items-stretch">
                <div className={`sticky left-0 z-10 flex shrink-0 px-2 text-right ${getLineGutterClassName()}`}>
                  {viewOnly || !hasOldSide ? (
                    <span className="flex h-5 min-w-8 items-center justify-end">{line.newLineNumber ?? ''}</span>
                  ) : (
                    <span className="inline-grid h-5 grid-cols-[2rem_3px_2rem] items-stretch gap-0">
                      <span className="flex h-5 min-w-8 items-center justify-end pr-1">{line.oldLineNumber ?? ''}</span>
                      <span className="flex h-full items-stretch justify-center" aria-hidden="true">
                        <span className={`block h-full w-px ${getLineNumberDividerClassName()}`} />
                      </span>
                      <span className="flex h-5 min-w-8 items-center justify-end pl-1">{line.newLineNumber ?? ''}</span>
                    </span>
                  )}
                </div>

                <div className={`min-h-5 flex-1 px-3 whitespace-pre ${getLineContentClassName(line, viewOnly)}`}>
                  {line.content.length > 0 ? line.content : ' '}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const DiffViewer = memo(DiffViewerComponent)
