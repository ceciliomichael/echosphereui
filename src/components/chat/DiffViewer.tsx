import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { useHighlightedCodeLines } from '../../hooks/useHighlightedCodeLines'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { computeDiffLines, type DiffLine } from '../../lib/textDiff'
import { PathLabel } from './PathLabel'
import { HighlightedCodeTokens } from './HighlightedCodeLine'
import type { HighlightedCodeLine as HighlightedCodeLineData } from '../../lib/codeHighlighting'

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
const DIFF_LINE_HEIGHT_PX = 20
const DIFF_LINE_OVERSCAN_COUNT = 40
const DIFF_VIRTUALIZATION_THRESHOLD = 800

function getScrollContainer(element: HTMLElement | null): HTMLElement | Window {
  if (!element) {
    return window
  }

  let currentElement: HTMLElement | null = element
  while (currentElement) {
    const computedStyle = window.getComputedStyle(currentElement)
    if (/(auto|scroll|overlay)/.test(computedStyle.overflowY)) {
      return currentElement
    }

    currentElement = currentElement.parentElement
  }

  return window
}

export function calculateVisibleDiffRange(input: {
  elementTop: number
  lineHeight: number
  overscanCount: number
  totalLineCount: number
  viewportHeight: number
  viewportTop: number
}) {
  const totalHeight = input.totalLineCount * input.lineHeight
  const visibleTop = Math.max(0, Math.min(totalHeight, input.viewportTop - input.elementTop))
  const visibleBottom = Math.max(0, Math.min(totalHeight, input.viewportTop + input.viewportHeight - input.elementTop))
  const startIndex = Math.max(0, Math.floor(visibleTop / input.lineHeight) - input.overscanCount)
  const endIndex = Math.min(
    input.totalLineCount,
    Math.ceil(visibleBottom / input.lineHeight) + input.overscanCount,
  )

  return {
    endIndex,
    startIndex,
  }
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

function getLineTokens(
  line: DiffLine,
  oldLines: readonly HighlightedCodeLineData[],
  newLines: readonly HighlightedCodeLineData[],
  startLineNumber: number,
) {
  const lineIndex = line.lineNumber === null ? null : line.lineNumber - startLineNumber
  if (lineIndex === null || lineIndex < 0) {
    return []
  }

  if (line.type === 'removed') {
    return oldLines[lineIndex]?.tokens ?? []
  }

  return newLines[lineIndex]?.tokens ?? oldLines[lineIndex]?.tokens ?? []
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
  const [virtualRange, setVirtualRange] = useState<{ startIndex: number; endIndex: number }>({
    endIndex: DIFF_VIRTUALIZATION_THRESHOLD,
    startIndex: 0,
  })
  const virtualRootRef = useRef<HTMLDivElement | null>(null)
  const isExpanded = expandedProp ?? internalExpanded
  const shouldRenderDiffContent = !collapsible || isExpanded
  const diffLines = useMemo(() => {
    if (!shouldRenderDiffContent) {
      return []
    }

    const diff = computeDiffLines(oldContent, newContent, { isStreaming, startLineNumber })
    return filterDiffWithContext(diff, contextLines)
  }, [contextLines, isStreaming, newContent, oldContent, shouldRenderDiffContent, startLineNumber])

  const iconConfig = resolveFileIconConfig({ fileName: filePath })
  const FileIcon = iconConfig.icon
  const renderedLines = useMemo(() => diffLines.filter((line) => line.type !== 'collapsed'), [diffLines])
  const highlightedOldLines = useHighlightedCodeLines(oldContent ?? '', {
    fileName: filePath,
    stripTrailingNewline: false,
  })
  const highlightedNewLines = useHighlightedCodeLines(newContent, {
    fileName: filePath,
    stripTrailingNewline: false,
  })
  const hasOldSide = !viewOnly && renderedLines.some((line) => line.oldLineNumber !== undefined)
  const shouldVirtualizeLines = renderedLines.length >= DIFF_VIRTUALIZATION_THRESHOLD
  const visibleStartIndex = shouldVirtualizeLines ? virtualRange.startIndex : 0
  const visibleEndIndex = shouldVirtualizeLines ? Math.min(renderedLines.length, virtualRange.endIndex) : renderedLines.length
  const visibleLines = shouldVirtualizeLines ? renderedLines.slice(visibleStartIndex, visibleEndIndex) : renderedLines
  const topSpacerHeight = shouldVirtualizeLines ? visibleStartIndex * DIFF_LINE_HEIGHT_PX : 0
  const bottomSpacerHeight = shouldVirtualizeLines ? (renderedLines.length - visibleEndIndex) * DIFF_LINE_HEIGHT_PX : 0
  const bodyHeightClassName = maxBodyHeightClassName ? `${maxBodyHeightClassName} overflow-y-auto` : ''

  useEffect(() => {
    if (!shouldRenderDiffContent || !shouldVirtualizeLines) {
      setVirtualRange({
        endIndex: renderedLines.length,
        startIndex: 0,
      })
      return
    }

    const rootElement = virtualRootRef.current
    const scrollContainer = getScrollContainer(rootElement)

    function updateVirtualRange() {
      if (!rootElement) {
        return
      }

      let viewportTop = 0
      let viewportHeight = window.innerHeight
      let elementTop = rootElement.getBoundingClientRect().top + window.scrollY

      if (scrollContainer instanceof HTMLElement) {
        viewportTop = scrollContainer.scrollTop
        viewportHeight = scrollContainer.clientHeight
        if (scrollContainer === rootElement) {
          elementTop = 0
        } else {
          const containerRect = scrollContainer.getBoundingClientRect()
          elementTop = rootElement.getBoundingClientRect().top - containerRect.top + scrollContainer.scrollTop
        }
      } else {
        viewportTop = window.scrollY
      }

      const { startIndex: visibleStart, endIndex: visibleEnd } = calculateVisibleDiffRange({
        elementTop,
        lineHeight: DIFF_LINE_HEIGHT_PX,
        overscanCount: DIFF_LINE_OVERSCAN_COUNT,
        totalLineCount: renderedLines.length,
        viewportHeight,
        viewportTop,
      })

      setVirtualRange((currentRange) => {
        if (currentRange.startIndex === visibleStart && currentRange.endIndex === visibleEnd) {
          return currentRange
        }

        return {
          endIndex: visibleEnd,
          startIndex: visibleStart,
        }
      })
    }

    updateVirtualRange()
    const frameId = window.requestAnimationFrame(updateVirtualRange)
    if (scrollContainer instanceof HTMLElement) {
      scrollContainer.addEventListener('scroll', updateVirtualRange, { passive: true })
    } else {
      window.addEventListener('scroll', updateVirtualRange, { passive: true })
    }
    window.addEventListener('resize', updateVirtualRange)

    return () => {
      window.cancelAnimationFrame(frameId)
      if (scrollContainer instanceof HTMLElement) {
        scrollContainer.removeEventListener('scroll', updateVirtualRange)
      } else {
        window.removeEventListener('scroll', updateVirtualRange)
      }
      window.removeEventListener('resize', updateVirtualRange)
    }
  }, [renderedLines.length, shouldRenderDiffContent, shouldVirtualizeLines])
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

      {shouldRenderDiffContent && (
        <div
          ref={virtualRootRef}
          className={[
            isStackedLayout ? 'overflow-hidden bg-surface' : 'overflow-hidden rounded-b-2xl bg-surface',
            bodyHeightClassName,
            'overflow-x-auto',
          ]
            .filter((value) => value.length > 0)
            .join(' ')}
        >
          <div className="min-w-0 bg-surface font-mono text-[12px] leading-5">
            <div className="flex min-w-0 items-stretch">
              <div className={`sticky left-0 z-10 shrink-0 border-r border-border ${getLineGutterClassName()}`}>
                {topSpacerHeight > 0 ? <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" /> : null}
                {visibleLines.map((line, index) => {
                  return (
                    <div key={`gutter-${line.type}-${visibleStartIndex + index}`} className="flex h-5 items-stretch px-2 text-right">
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
                {bottomSpacerHeight > 0 ? <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" /> : null}
              </div>

              <div className="min-w-0 flex-1 bg-surface">
                <div className="min-w-full w-fit">
                  {topSpacerHeight > 0 ? <div style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" /> : null}
                  {visibleLines.map((line, index) => {
                    const highlightedTokens = getLineTokens(line, highlightedOldLines, highlightedNewLines, startLineNumber)
                    return (
                      <div
                        key={`content-${line.type}-${visibleStartIndex + index}`}
                        className={`h-5 px-3 whitespace-pre ${getLineContentClassName(line, viewOnly)}`}
                      >
                        {highlightedTokens.length > 0 ? (
                          <HighlightedCodeTokens tokens={highlightedTokens} />
                        ) : (
                          line.content.length > 0 ? line.content : ' '
                        )}
                      </div>
                    )
                  })}
                  {bottomSpacerHeight > 0 ? <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" /> : null}
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
