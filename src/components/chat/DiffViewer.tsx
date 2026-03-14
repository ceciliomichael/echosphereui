import { memo, useState, useMemo, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { computeDiffLines, type DiffLine } from '../../lib/textDiff'
import { PathLabel } from './PathLabel'

interface DiffViewerProps {
  className?: string
  collapsible?: boolean
  contextLines?: number
  defaultExpanded?: boolean
  filePath: string
  headerClassName?: string
  headerInlineContent?: ReactNode
  headerRightContent?: ReactNode
  headerTrailingContent?: ReactNode
  isExpanded?: boolean
  isStreaming?: boolean
  layout?: 'card' | 'stacked'
  maxBodyHeightClassName?: string
  newContent: string
  onExpandedChange?: (nextValue: boolean) => void
  oldContent: string | null | undefined
  startLineNumber?: number
  viewOnly?: boolean
}

const DEFAULT_DIFF_CONTEXT_LINES = 5

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
  className,
  collapsible = false,
  contextLines = DEFAULT_DIFF_CONTEXT_LINES,
  defaultExpanded = true,
  filePath,
  headerClassName,
  headerInlineContent,
  headerRightContent,
  headerTrailingContent,
  isExpanded: expandedProp,
  isStreaming = false,
  layout = 'card',
  maxBodyHeightClassName,
  newContent,
  onExpandedChange,
  oldContent,
  startLineNumber = 1,
  viewOnly = false,
}: DiffViewerProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isExpanded = expandedProp ?? internalExpanded
  const diffLines = useMemo(() => {
    const diff = computeDiffLines(oldContent, newContent, { isStreaming, startLineNumber })
    return filterDiffWithContext(diff, contextLines)
  }, [contextLines, isStreaming, newContent, oldContent, startLineNumber])

  const iconConfig = resolveFileIconConfig({ fileName: filePath })
  const FileIcon = iconConfig.icon
  const hasOldSide = !viewOnly && diffLines.some((line) => line.type !== 'collapsed' && line.oldLineNumber !== undefined)
  const headerMainContent = (
    <span className="inline-flex min-h-4 min-w-0 flex-1 items-center gap-2">
      <span className="relative flex h-4 w-4 items-center justify-center">
        <FileIcon
          size={14}
          style={{ color: iconConfig.color }}
          aria-hidden="true"
          className={collapsible ? 'transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0' : ''}
        />
        {collapsible ? (
          <ChevronRight
            size={15}
            className={[
              'absolute inset-0 m-auto text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-focus-visible:opacity-100',
              isExpanded ? 'rotate-90' : '',
            ].join(' ')}
          />
        ) : null}
      </span>
      <span className="inline-flex min-w-0 items-center gap-2">
        <PathLabel path={filePath} className="min-w-0 leading-[1] text-foreground" />
        {headerInlineContent ? <span className="inline-flex shrink-0 items-center">{headerInlineContent}</span> : null}
        {headerTrailingContent ? <span className="inline-flex shrink-0 items-center">{headerTrailingContent}</span> : null}
      </span>
    </span>
  )
  const hasRightHeaderContent = Boolean(headerRightContent)

  const isStackedLayout = layout === 'stacked'

  return (
    <div
      className={[
        isStackedLayout
          ? 'my-0 w-full overflow-hidden rounded-none border-0 border-b border-border bg-surface shadow-none'
          : 'my-2 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-sm',
        className ?? '',
      ].join(' ')}
    >
      {collapsible ? (
        <div
          className={[
            'group flex w-full items-center justify-between bg-surface px-4 py-3 text-[12px] text-muted-foreground',
            isExpanded ? 'border-b border-border' : '',
            headerClassName ?? '',
          ].join(' ')}
        >
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => {
              const nextExpanded = !isExpanded
              if (expandedProp === undefined) {
                setInternalExpanded(nextExpanded)
              }
              onExpandedChange?.(nextExpanded)
            }}
            className={hasRightHeaderContent ? 'group flex min-w-0 flex-1 items-center text-left' : 'group flex min-w-0 w-full items-center text-left'}
          >
            {headerMainContent}
          </button>
          {hasRightHeaderContent ? <span className="ml-3 inline-flex shrink-0 items-center">{headerRightContent}</span> : null}
        </div>
      ) : (
        <div
          className={[
            'flex items-center justify-between border-b border-border bg-surface px-4 py-3 text-[12px] text-muted-foreground',
            headerClassName ?? '',
          ].join(' ')}
        >
          {headerMainContent}
          {hasRightHeaderContent ? <span className="ml-3 inline-flex shrink-0 items-center">{headerRightContent}</span> : null}
        </div>
      )}

      {(!collapsible || isExpanded) && (
        <div
          className={[
            isStackedLayout ? 'overflow-hidden bg-surface' : 'overflow-hidden rounded-b-2xl bg-surface',
            maxBodyHeightClassName ? `${maxBodyHeightClassName} overflow-y-auto` : '',
            'overflow-x-scroll',
          ]
            .filter((value) => value.length > 0)
            .join(' ')}
        >
          <div className="min-w-0 bg-surface font-mono text-[12px] leading-5">
            <div className="flex min-w-0 items-stretch">
              <div className={`sticky left-0 z-10 shrink-0 border-r border-border ${getLineGutterClassName()}`}>
                {diffLines.map((line, index) => {
                  if (line.type === 'collapsed') {
                    return null
                  }

                  return (
                    <div key={`gutter-${line.type}-${index}`} className="flex min-h-5 items-stretch px-2 text-right">
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
                  )
                })}
              </div>

              <div className="min-w-0 flex-1 bg-surface">
                <div className="min-w-full w-fit">
                  {diffLines.map((line, index) => {
                    if (line.type === 'collapsed') {
                      return null
                    }

                    return (
                      <div key={`content-${line.type}-${index}`} className={`min-h-5 px-3 whitespace-pre ${getLineContentClassName(line, viewOnly)}`}>
                        {line.content.length > 0 ? line.content : ' '}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const DiffViewer = memo(DiffViewerComponent)
