import {
  VscArrowDown,
  VscArrowUp,
  VscCaseSensitive,
  VscClose,
  VscChevronRight,
  VscPreserveCase,
  VscRegex,
  VscReplace,
  VscReplaceAll,
  VscWholeWord,
} from 'react-icons/vsc'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useHighlightedCodeLines } from '../../hooks/useHighlightedCodeLines'
import type { HighlightedToken } from '../../lib/codeHighlighting'

interface WorkspaceFileEditorProps {
  fileName: string
  value: string
  onChange: (nextValue: string) => void
}

const EDITOR_LINE_HEIGHT_PX = 20
const EDITOR_LINE_OVERSCAN_COUNT = 40
const EDITOR_VIRTUALIZATION_THRESHOLD = 800
const SEARCH_HIGHLIGHT_BACKGROUND = 'var(--workspace-editor-search-highlight-background)'
const ACTIVE_SEARCH_HIGHLIGHT_BACKGROUND = 'var(--workspace-editor-search-highlight-active-background)'

interface TextRange {
  end: number
  isActive: boolean
  start: number
}

interface SearchMatch {
  end: number
  start: number
  value: string
}

interface SearchOptions {
  matchCase: boolean
  regex: boolean
  wholeWord: boolean
}

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

function getTokenClassName(fontStyle: number | undefined) {
  if (!fontStyle) {
    return ''
  }

  return [fontStyle & 1 ? 'italic' : '', fontStyle & 2 ? 'font-semibold' : '', fontStyle & 4 ? 'underline' : '']
    .filter((value) => value.length > 0)
    .join(' ')
}

function isWordCharacter(charCode: number | undefined) {
  if (charCode === undefined) {
    return false
  }

  return (
    (charCode >= 48 && charCode <= 57) ||
    (charCode >= 65 && charCode <= 90) ||
    (charCode >= 97 && charCode <= 122) ||
    charCode === 95
  )
}

function hasWholeWordBoundary(text: string, start: number, end: number) {
  const previousCharCode = start > 0 ? text.charCodeAt(start - 1) : undefined
  const nextCharCode = end < text.length ? text.charCodeAt(end) : undefined
  return !isWordCharacter(previousCharCode) && !isWordCharacter(nextCharCode)
}

function buildSearchRegularExpression(searchValue: string, options: SearchOptions, global: boolean) {
  if (searchValue.length === 0) {
    return null
  }

  const source = options.wholeWord ? `\\b(?:${searchValue})\\b` : searchValue
  const flags = `${global ? 'g' : ''}${options.matchCase ? '' : 'i'}`

  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

function findSearchMatches(text: string, searchValue: string, options: SearchOptions): SearchMatch[] {
  if (searchValue.length === 0) {
    return []
  }

  if (options.regex) {
    const expression = buildSearchRegularExpression(searchValue, options, true)
    if (!expression) {
      return []
    }

    const matches: SearchMatch[] = []
    for (const match of text.matchAll(expression)) {
      const matchedText = match[0] ?? ''
      const start = match.index ?? -1
      if (start < 0) {
        continue
      }

      const safeValue = matchedText.length > 0 ? matchedText : text.slice(start, start + 1)
      matches.push({
        end: start + safeValue.length,
        start,
        value: safeValue,
      })

      if (matchedText.length === 0) {
        expression.lastIndex = start + 1
      }
    }
    return matches
  }

  const normalizedText = options.matchCase ? text : text.toLowerCase()
  const normalizedSearchValue = options.matchCase ? searchValue : searchValue.toLowerCase()
  const ranges: SearchMatch[] = []
  let searchStartIndex = 0

  while (searchStartIndex <= normalizedText.length - normalizedSearchValue.length) {
    const nextMatchIndex = normalizedText.indexOf(normalizedSearchValue, searchStartIndex)
    if (nextMatchIndex === -1) {
      break
    }

    const nextMatchEnd = nextMatchIndex + normalizedSearchValue.length
    if (options.wholeWord && !hasWholeWordBoundary(text, nextMatchIndex, nextMatchEnd)) {
      searchStartIndex = nextMatchIndex + 1
      continue
    }

    ranges.push({
      start: nextMatchIndex,
      end: nextMatchEnd,
      value: text.slice(nextMatchIndex, nextMatchEnd),
    })
    searchStartIndex = nextMatchIndex + Math.max(1, normalizedSearchValue.length)
  }

  return ranges
}

function findLineStartOffsets(text: string) {
  const offsets = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      offsets.push(index + 1)
    }
  }
  return offsets
}

function findLineIndexForOffset(lineStartOffsets: readonly number[], offset: number) {
  let low = 0
  let high = lineStartOffsets.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const lineStart = lineStartOffsets[middle]
    const nextLineStart = lineStartOffsets[middle + 1] ?? Number.POSITIVE_INFINITY

    if (offset < lineStart) {
      high = middle - 1
      continue
    }
    if (offset >= nextLineStart) {
      low = middle + 1
      continue
    }

    return middle
  }

  return Math.max(0, lineStartOffsets.length - 1)
}

function renderHighlightedTokens(tokens: readonly HighlightedToken[], matches: readonly TextRange[]): ReactNode {
  if (tokens.length === 0) {
    return '\u00A0'
  }

  if (matches.length === 0) {
    return tokens.map((token, index) => (
      <span
        key={`${index}:${token.content.slice(0, 16)}:${token.color ?? ''}`}
        className={getTokenClassName(token.fontStyle)}
        style={token.color ? { color: token.color } : undefined}
      >
        {token.content}
      </span>
    ))
  }

  const renderedSegments: ReactNode[] = []
  let absoluteIndex = 0
  let matchIndex = 0

  for (const token of tokens) {
    const tokenStartIndex = absoluteIndex
    const tokenEndIndex = tokenStartIndex + token.content.length
    let tokenOffset = 0

    while (tokenOffset < token.content.length) {
      while (matchIndex < matches.length && matches[matchIndex].end <= tokenStartIndex + tokenOffset) {
        matchIndex += 1
      }

      const activeMatch = matches[matchIndex]
      const absoluteOffset = tokenStartIndex + tokenOffset
      const hasMatchWithinToken =
        Boolean(activeMatch) && activeMatch.start < tokenEndIndex && activeMatch.end > absoluteOffset

      if (!hasMatchWithinToken) {
        const remainingText = token.content.slice(tokenOffset)
        if (remainingText.length > 0) {
          renderedSegments.push(
            <span
              key={`${tokenStartIndex}:${tokenOffset}:${remainingText.slice(0, 16)}:plain`}
              className={getTokenClassName(token.fontStyle)}
              style={token.color ? { color: token.color } : undefined}
            >
              {remainingText}
            </span>,
          )
        }
        break
      }

      if (activeMatch.start > absoluteOffset) {
        const plainEndIndex = Math.min(activeMatch.start, tokenEndIndex)
        const plainText = token.content.slice(tokenOffset, plainEndIndex - tokenStartIndex)
        if (plainText.length > 0) {
          renderedSegments.push(
            <span
              key={`${tokenStartIndex}:${tokenOffset}:${plainText.slice(0, 16)}:plain`}
              className={getTokenClassName(token.fontStyle)}
              style={token.color ? { color: token.color } : undefined}
            >
              {plainText}
            </span>,
          )
        }
        tokenOffset = plainEndIndex - tokenStartIndex
        continue
      }

      const highlightedEndIndex = Math.min(activeMatch.end, tokenEndIndex)
      const highlightedText = token.content.slice(tokenOffset, highlightedEndIndex - tokenStartIndex)
      renderedSegments.push(
        <span
          key={`${tokenStartIndex}:${tokenOffset}:${highlightedText.slice(0, 16)}:match`}
          className={getTokenClassName(token.fontStyle)}
          style={{
            backgroundColor: activeMatch.isActive ? ACTIVE_SEARCH_HIGHLIGHT_BACKGROUND : SEARCH_HIGHLIGHT_BACKGROUND,
            borderRadius: 2,
          }}
        >
          {highlightedText}
        </span>,
      )
      tokenOffset = highlightedEndIndex - tokenStartIndex
    }

    absoluteIndex = tokenEndIndex
  }

  return renderedSegments
}

export const WorkspaceFileEditor = memo(function WorkspaceFileEditor({ fileName, value, onChange }: WorkspaceFileEditorProps) {
  const lineNumbersRef = useRef<HTMLDivElement | null>(null)
  const highlightedLayerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightedLines = useHighlightedCodeLines(value, { fileName, stripTrailingNewline: false })
  const totalLineCount = useMemo(() => countLines(value), [value])
  const [searchValue, setSearchValue] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isReplaceOpen, setIsReplaceOpen] = useState(false)
  const [isMatchCaseEnabled, setIsMatchCaseEnabled] = useState(false)
  const [isRegexEnabled, setIsRegexEnabled] = useState(false)
  const [isWholeWordEnabled, setIsWholeWordEnabled] = useState(false)
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(-1)
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
  const lineStartOffsets = useMemo(() => findLineStartOffsets(value), [value])
  const searchMatches = useMemo(
    () =>
      findSearchMatches(value, searchValue, {
        matchCase: isMatchCaseEnabled,
        wholeWord: isWholeWordEnabled,
        regex: isRegexEnabled,
      }),
    [isMatchCaseEnabled, isRegexEnabled, isWholeWordEnabled, searchValue, value],
  )
  const searchMatchesByLine = useMemo(() => {
    const matchesByLine = highlightedLines.map(() => [] as TextRange[])
    for (let index = 0; index < searchMatches.length; index += 1) {
      const match = searchMatches[index]
      if (match.end <= match.start) {
        continue
      }

      const startLineIndex = findLineIndexForOffset(lineStartOffsets, match.start)
      const endLineIndex = findLineIndexForOffset(lineStartOffsets, Math.max(match.end - 1, match.start))
      if (startLineIndex !== endLineIndex) {
        continue
      }

      const lineStartOffset = lineStartOffsets[startLineIndex] ?? 0
      matchesByLine[startLineIndex].push({
        end: match.end - lineStartOffset,
        isActive: index === activeSearchMatchIndex,
        start: match.start - lineStartOffset,
      })
    }
    return matchesByLine
  }, [activeSearchMatchIndex, highlightedLines, lineStartOffsets, searchMatches])
  const visibleSearchMatches = useMemo(
    () => searchMatchesByLine.slice(visibleStartIndex, visibleEndIndex),
    [searchMatchesByLine, visibleEndIndex, visibleStartIndex],
  )
  const totalSearchMatchCount = searchMatches.length

  const handleScroll = useCallback(() => {
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

    if (!shouldVirtualize) {
      return
    }

    const visibleTop = textAreaElement.scrollTop
    const visibleBottom = visibleTop + textAreaElement.clientHeight
    const visibleStart = Math.max(0, Math.floor(visibleTop / EDITOR_LINE_HEIGHT_PX) - EDITOR_LINE_OVERSCAN_COUNT)
    const visibleEnd = Math.min(totalLineCount, Math.ceil(visibleBottom / EDITOR_LINE_HEIGHT_PX) + EDITOR_LINE_OVERSCAN_COUNT)

    setVirtualRange((currentRange) => {
      if (currentRange.startIndex === visibleStart && currentRange.endIndex === visibleEnd) {
        return currentRange
      }

      return {
        endIndex: visibleEnd,
        startIndex: visibleStart,
      }
    })
  }, [shouldVirtualize, totalLineCount])

  function closeSearchPanel() {
    setIsSearchOpen(false)
    setIsReplaceOpen(false)
    window.requestAnimationFrame(() => {
      textAreaRef.current?.focus()
    })
  }

  function focusSearchInput() {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }

  function focusReplaceInput() {
    window.requestAnimationFrame(() => {
      replaceInputRef.current?.focus()
      replaceInputRef.current?.select()
    })
  }

  function moveSearchMatch(direction: 1 | -1) {
    if (searchMatches.length === 0) {
      return
    }
    setActiveSearchMatchIndex((currentIndex) => {
      const baseIndex = currentIndex < 0 ? 0 : currentIndex
      return (baseIndex + direction + searchMatches.length) % searchMatches.length
    })
  }

  function handleReplaceCurrentMatch() {
    if (activeSearchMatchIndex < 0 || activeSearchMatchIndex >= searchMatches.length) {
      return
    }

    const activeMatch = searchMatches[activeSearchMatchIndex]
    const replacementText = isRegexEnabled
      ? activeMatch.value.replace(buildSearchRegularExpression(searchValue, {
          matchCase: isMatchCaseEnabled,
          regex: true,
          wholeWord: isWholeWordEnabled,
        }, false) ?? /$^/, replaceValue)
      : replaceValue
    const nextValue = `${value.slice(0, activeMatch.start)}${replacementText}${value.slice(activeMatch.end)}`
    onChange(nextValue)
  }

  function handleReplaceAllMatches() {
    if (searchMatches.length === 0) {
      return
    }

    if (isRegexEnabled) {
      const expression = buildSearchRegularExpression(searchValue, {
        matchCase: isMatchCaseEnabled,
        regex: true,
        wholeWord: isWholeWordEnabled,
      }, true)
      if (!expression) {
        return
      }
      onChange(value.replace(expression, replaceValue))
      return
    }

    let nextValue = value
    for (let index = searchMatches.length - 1; index >= 0; index -= 1) {
      const match = searchMatches[index]
      nextValue = `${nextValue.slice(0, match.start)}${replaceValue}${nextValue.slice(match.end)}`
    }
    onChange(nextValue)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      setIsSearchOpen(true)
      setIsReplaceOpen(false)
      focusSearchInput()
      return
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'h') {
      event.preventDefault()
      setIsSearchOpen(true)
      setIsReplaceOpen(true)
      focusReplaceInput()
      return
    }

    if (event.key === 'Escape' && isSearchOpen) {
      event.preventDefault()
      closeSearchPanel()
      return
    }

    if (event.key === 'Enter' && isSearchOpen) {
      event.preventDefault()
      moveSearchMatch(event.shiftKey ? -1 : 1)
      return
    }

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

  useEffect(() => {
    setSearchValue('')
    setReplaceValue('')
    setIsSearchOpen(false)
    setIsReplaceOpen(false)
    setIsMatchCaseEnabled(false)
    setIsRegexEnabled(false)
    setIsWholeWordEnabled(false)
    setActiveSearchMatchIndex(-1)
  }, [fileName])

  useEffect(() => {
    setActiveSearchMatchIndex((currentIndex) => {
      if (searchMatches.length === 0) {
        return -1
      }
      if (currentIndex < 0 || currentIndex >= searchMatches.length) {
        return 0
      }
      return currentIndex
    })
  }, [searchMatches])

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
      const visibleEnd = Math.min(totalLineCount, Math.ceil(visibleBottom / EDITOR_LINE_HEIGHT_PX) + EDITOR_LINE_OVERSCAN_COUNT)

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

  useEffect(() => {
    if (!isSearchOpen) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      handleScroll()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [handleScroll, isSearchOpen])

  useEffect(() => {
    if (!isSearchOpen || activeSearchMatchIndex < 0 || activeSearchMatchIndex >= searchMatches.length) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const textAreaElement = textAreaRef.current
      if (!textAreaElement) {
        return
      }

      const activeMatch = searchMatches[activeSearchMatchIndex]
      const lineIndex = findLineIndexForOffset(lineStartOffsets, activeMatch.start)
      const targetScrollTop = Math.max(
        0,
        lineIndex * EDITOR_LINE_HEIGHT_PX - textAreaElement.clientHeight / 2 + EDITOR_LINE_HEIGHT_PX / 2,
      )
      textAreaElement.scrollTop = targetScrollTop
      const activeElement = document.activeElement
      const isTypingInSearchField = activeElement === searchInputRef.current || activeElement === replaceInputRef.current
      if (!isTypingInSearchField) {
        textAreaElement.selectionStart = activeMatch.start
        textAreaElement.selectionEnd = activeMatch.end
      }
      handleScroll()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [activeSearchMatchIndex, handleScroll, isSearchOpen, lineStartOffsets, searchMatches])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 bg-surface">
      <div className="flex min-h-0 flex-1 min-w-0">
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
          {isSearchOpen ? (
            <div className="absolute right-4 top-3 z-20 w-[min(31rem,calc(100%-2rem))] overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#1e1e1e] text-[#cccccc] shadow-sm">
              <div className="flex items-stretch">
                <div className="flex w-8 shrink-0 border-r border-[#2e2e2e]">
                  <button
                    type="button"
                    onClick={() => setIsReplaceOpen((currentValue) => !currentValue)}
                    className="inline-flex h-full min-h-8 w-full items-center justify-center text-[#c5c5c5] transition-colors hover:bg-[#2a2d2e] hover:text-white"
                    aria-label={isReplaceOpen ? 'Hide replace input' : 'Show replace input'}
                  >
                    <VscChevronRight size={16} className={`transition-transform ${isReplaceOpen ? 'rotate-90' : 'rotate-0'}`} />
                  </button>
                </div>
                <div className="min-w-0 flex-1 py-0.5 pr-1">
                  <div className="flex min-h-8 items-center gap-1 pl-1 pr-1">
                  <label className="sr-only" htmlFor="workspace-editor-search">
                    Find in file
                  </label>
                  <input
                    ref={searchInputRef}
                    id="workspace-editor-search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        closeSearchPanel()
                        return
                      }
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        moveSearchMatch(event.shiftKey ? -1 : 1)
                      }
                    }}
                    placeholder="Find"
                    aria-label="Find in current file"
                    className="h-7 min-w-0 flex-1 rounded-lg border border-[#3c3c3c] bg-[#252526] px-2 text-[13px] text-[#d4d4d4] outline-none placeholder:text-[#8b8b8b]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsMatchCaseEnabled((currentValue) => !currentValue)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      isMatchCaseEnabled
                        ? 'bg-[#2a2d2e] text-white'
                        : 'text-[#c5c5c5] hover:bg-[#2a2d2e] hover:text-white'
                    }`}
                    aria-label="Toggle match case"
                    title="Match case"
                  >
                    <VscCaseSensitive size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWholeWordEnabled((currentValue) => !currentValue)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      isWholeWordEnabled
                        ? 'bg-[#2a2d2e] text-white'
                        : 'text-[#c5c5c5] hover:bg-[#2a2d2e] hover:text-white'
                    }`}
                    aria-label="Toggle whole word"
                    title="Match whole word"
                  >
                    <VscWholeWord size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRegexEnabled((currentValue) => !currentValue)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      isRegexEnabled
                        ? 'bg-[#2a2d2e] text-white'
                        : 'text-[#c5c5c5] hover:bg-[#2a2d2e] hover:text-white'
                    }`}
                    aria-label="Toggle regular expression"
                    title="Use regular expression"
                  >
                    <VscRegex size={16} />
                  </button>
                  <span className="min-w-16 px-1 text-center text-[12px] text-[#c5c5c5]">
                    {totalSearchMatchCount > 0 ? `${activeSearchMatchIndex + 1} / ${totalSearchMatchCount}` : 'No results'}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveSearchMatch(-1)}
                    disabled={totalSearchMatchCount === 0}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#c5c5c5] transition-colors hover:bg-[#2a2d2e] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous match"
                  >
                    <VscArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSearchMatch(1)}
                    disabled={totalSearchMatchCount === 0}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#c5c5c5] transition-colors hover:bg-[#2a2d2e] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next match"
                  >
                    <VscArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={closeSearchPanel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#c5c5c5] transition-colors hover:bg-[#2a2d2e] hover:text-white"
                    aria-label="Close find panel"
                  >
                    <VscClose size={16} />
                  </button>
                  </div>
                  {isReplaceOpen ? (
                    <div className="mt-px flex min-h-8 items-center gap-1 pl-1 pr-1">
                      <label className="sr-only" htmlFor="workspace-editor-replace">
                        Replace in file
                      </label>
                      <input
                        ref={replaceInputRef}
                        id="workspace-editor-replace"
                        value={replaceValue}
                        onChange={(event) => setReplaceValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            closeSearchPanel()
                            return
                          }
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleReplaceCurrentMatch()
                          }
                        }}
                        placeholder="Replace"
                        aria-label="Replace in current file"
                        className="h-7 min-w-0 flex-1 rounded-lg border border-[#3c3c3c] bg-[#252526] px-2 text-[13px] text-[#d4d4d4] outline-none placeholder:text-[#8b8b8b]"
                      />
                      <button
                        type="button"
                        onClick={handleReplaceCurrentMatch}
                        disabled={totalSearchMatchCount === 0}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#c5c5c5] transition-colors hover:bg-[#2a2d2e] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Replace current match"
                        title="Replace"
                      >
                        <VscReplace size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleReplaceAllMatches}
                        disabled={totalSearchMatchCount === 0}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#c5c5c5] transition-colors hover:bg-[#2a2d2e] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Replace all matches"
                        title="Replace All"
                      >
                        <VscReplaceAll size={16} />
                      </button>
                      <button
                        type="button"
                        disabled
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#6f6f6f] opacity-60"
                        aria-label="Preserve case"
                        title="Preserve Case"
                      >
                        <VscPreserveCase size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
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
                    {renderHighlightedTokens(line.tokens, visibleSearchMatches[index] ?? [])}
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
            className="workspace-editor-scrollbar workspace-editor-textarea absolute inset-0 h-full min-h-0 w-full resize-none overflow-auto border-0 bg-transparent px-3 py-1.5 font-mono text-[12px] leading-5 outline-none"
          />
        </div>
      </div>
    </div>
  )
})
