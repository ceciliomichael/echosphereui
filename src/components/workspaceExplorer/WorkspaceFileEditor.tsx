import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { HighlightedCodeLine } from '../chat/HighlightedCodeLine'
import { useHighlightedCodeLines } from '../../hooks/useHighlightedCodeLines'

interface WorkspaceFileEditorProps {
  fileName: string
  value: string
  onChange: (nextValue: string) => void
}

const EDITOR_LINE_HEIGHT_PX = 20
const EDITOR_LINE_OVERSCAN_COUNT = 40
const EDITOR_VIRTUALIZATION_THRESHOLD = 800

function countLines(value: string) {
  if (value.length === 0) {
    return 1
  }

  let totalLines = 1
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) {
      totalLines += 1
    }
  }

  return totalLines
}

export const WorkspaceFileEditor = memo(function WorkspaceFileEditor({ fileName, value, onChange }: WorkspaceFileEditorProps) {
  const lineNumbersRef = useRef<HTMLDivElement | null>(null)
  const highlightedLayerRef = useRef<HTMLDivElement | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightedLines = useHighlightedCodeLines(value, { fileName, stripTrailingNewline: false })
  const totalLineCount = useMemo(() => countLines(value), [value])
  const [virtualRange, setVirtualRange] = useState(() => ({
    endIndex: Math.min(totalLineCount, EDITOR_VIRTUALIZATION_THRESHOLD),
    startIndex: 0,
  }))
  const shouldVirtualize = totalLineCount >= EDITOR_VIRTUALIZATION_THRESHOLD
  const gutterWidthCh = Math.max(4, String(totalLineCount).length + 1)
  const visibleStartIndex = shouldVirtualize ? virtualRange.startIndex : 0
  const visibleEndIndex = shouldVirtualize ? Math.min(totalLineCount, virtualRange.endIndex) : totalLineCount
  const topSpacerHeight = shouldVirtualize ? visibleStartIndex * EDITOR_LINE_HEIGHT_PX : 0
  const bottomSpacerHeight = shouldVirtualize ? (totalLineCount - visibleEndIndex) * EDITOR_LINE_HEIGHT_PX : 0
  const visibleLineNumbers = useMemo(
    () =>
      Array.from({ length: Math.max(0, visibleEndIndex - visibleStartIndex) }, (_, index) => visibleStartIndex + index + 1),
    [visibleEndIndex, visibleStartIndex],
  )
  const visibleHighlightedLines = useMemo(
    () => highlightedLines.slice(visibleStartIndex, visibleEndIndex),
    [highlightedLines, visibleEndIndex, visibleStartIndex],
  )

  useEffect(() => {
    if (!shouldVirtualize) {
      setVirtualRange({
        endIndex: totalLineCount,
        startIndex: 0,
      })
      return
    }

    function updateVirtualRange() {
      const textAreaElement = textAreaRef.current
      if (!textAreaElement) {
        return
      }

      const visibleTop = textAreaElement.scrollTop
      const visibleBottom = visibleTop + textAreaElement.clientHeight
      const visibleStart = Math.max(0, Math.floor(visibleTop / EDITOR_LINE_HEIGHT_PX) - EDITOR_LINE_OVERSCAN_COUNT)
      const visibleEnd = Math.min(
        totalLineCount,
        Math.ceil(visibleBottom / EDITOR_LINE_HEIGHT_PX) + EDITOR_LINE_OVERSCAN_COUNT,
      )

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
    window.addEventListener('resize', updateVirtualRange)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateVirtualRange)
    }
  }, [shouldVirtualize, totalLineCount])

  function handleScroll() {
    const textAreaElement = textAreaRef.current
    if (!textAreaElement) {
      return
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textAreaElement.scrollTop
    }
    if (highlightedLayerRef.current) {
      highlightedLayerRef.current.scrollTop = textAreaElement.scrollTop
      highlightedLayerRef.current.scrollLeft = textAreaElement.scrollLeft
    }

    if (shouldVirtualize) {
      const visibleTop = textAreaElement.scrollTop
      const visibleBottom = visibleTop + textAreaElement.clientHeight
      const visibleStart = Math.max(0, Math.floor(visibleTop / EDITOR_LINE_HEIGHT_PX) - EDITOR_LINE_OVERSCAN_COUNT)
      const visibleEnd = Math.min(
        totalLineCount,
        Math.ceil(visibleBottom / EDITOR_LINE_HEIGHT_PX) + EDITOR_LINE_OVERSCAN_COUNT,
      )

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
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') {
      return
    }

    event.preventDefault()
    const target = event.currentTarget
    const selectionStart = target.selectionStart
    const selectionEnd = target.selectionEnd
    const nextValue = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
    onChange(nextValue)
    window.requestAnimationFrame(() => {
      if (!textAreaRef.current) {
        return
      }
      textAreaRef.current.selectionStart = selectionStart + 2
      textAreaRef.current.selectionEnd = selectionStart + 2
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 bg-surface">
      <div
        ref={lineNumbersRef}
        className="scroll-stable h-full shrink-0 overflow-hidden bg-surface"
        style={{ width: `${gutterWidthCh}ch` }}
      >
        <pre className="m-0 py-1.5 text-[12px] leading-5 text-subtle-foreground">
          <code className="block">
            {topSpacerHeight > 0 ? <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} /> : null}
            {visibleLineNumbers.map((lineNumber) => (
              <div key={`line-number-${lineNumber}`} className="select-none px-2 text-right">
                {lineNumber}
              </div>
            ))}
            {bottomSpacerHeight > 0 ? <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} /> : null}
          </code>
        </pre>
      </div>
      <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-surface">
        <div
          ref={highlightedLayerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-1.5 font-mono text-[12px] leading-5 text-foreground"
          aria-hidden="true"
        >
          <pre className="m-0 min-w-full bg-transparent">
            <code className="block w-fit min-w-full bg-transparent">
              {topSpacerHeight > 0 ? <div aria-hidden="true" style={{ height: `${topSpacerHeight}px` }} /> : null}
              {visibleHighlightedLines.map((line, index) => (
                <div
                  key={`editor-highlighted-${visibleStartIndex + index}-${line.text.slice(0, 16)}`}
                  className="whitespace-pre"
                >
                  <HighlightedCodeLine line={line} />
                </div>
              ))}
              {bottomSpacerHeight > 0 ? <div aria-hidden="true" style={{ height: `${bottomSpacerHeight}px` }} /> : null}
            </code>
          </pre>
        </div>
        <textarea
          ref={textAreaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          wrap="off"
          aria-label={`Editing ${fileName}`}
          style={{ caretColor: 'var(--color-foreground)', color: 'transparent' }}
          className="workspace-editor-scrollbar absolute inset-0 h-full min-h-0 w-full resize-none overflow-auto border-0 bg-transparent px-3 py-1.5 font-mono text-[12px] leading-5 outline-none selection:bg-action/25"
        />
      </div>
    </div>
  )
})
