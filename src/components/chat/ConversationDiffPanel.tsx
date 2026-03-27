import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Maximize, Minimize, Minus, Plus, Undo2 } from 'lucide-react'
import { useFloatingMenuPosition } from '../../hooks/useFloatingMenuPosition'
import type { ConversationFileDiff } from '../../lib/chatDiffs'
import { MIN_DIFF_PANEL_WIDTH, getMaxDiffPanelWidth } from '../../lib/diffPanelSizing'
import { Tooltip } from '../Tooltip'
import { DiffViewer } from './DiffViewer'

interface ConversationDiffPanelProps {
  currentBranch: string | null
  expandedFilePaths: readonly string[]
  fileDiffs: readonly ConversationFileDiff[]
  isOpen: boolean
  onDiscardFile: (filePath: string) => Promise<void>
  onExpandedFilePathsChange: (nextFilePaths: string[]) => void
  onStageFile: (filePath: string) => Promise<void>
  onUnstageFile: (filePath: string) => Promise<void>
  onSelectedScopeChange: (nextScope: DiffPanelScope) => void
  onWidthChange: (nextWidth: number) => void
  onWidthCommit?: (nextWidth: number) => void
  pendingFileActionPath: string | null
  selectedScope: DiffPanelScope
  width: number
}

export type DiffPanelScope = 'branch' | 'last_turn' | 'staged' | 'unstaged'

interface DiffScopeOption {
  description: string | null
  label: string
  value: DiffPanelScope
}

export function ConversationDiffPanel({
  currentBranch,
  expandedFilePaths,
  fileDiffs,
  isOpen,
  onDiscardFile,
  onExpandedFilePathsChange,
  onStageFile,
  onUnstageFile,
  onSelectedScopeChange,
  onWidthChange,
  onWidthCommit,
  pendingFileActionPath,
  selectedScope,
  width,
}: ConversationDiffPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const scopeContainerRef = useRef<HTMLDivElement | null>(null)
  const scopeButtonRef = useRef<HTMLButtonElement | null>(null)
  const scopeMenuRef = useRef<HTMLDivElement | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [renderedWidth, setRenderedWidth] = useState(width)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false)
  const [highlightedScope, setHighlightedScope] = useState<DiffPanelScope>('unstaged')
  const dragStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  const onWidthChangeRef = useRef(onWidthChange)
  const onWidthCommitRef = useRef(onWidthCommit)
  const menuStyle = useFloatingMenuPosition({
    anchorRef: scopeButtonRef,
    isOpen: isScopeMenuOpen,
    menuRef: scopeMenuRef,
  })

  const branchLabel = currentBranch ? `${currentBranch} → origin/${currentBranch}` : 'No branch selected'
  const isUnstagedLikeFileDiff = useMemo(
    () => (fileDiff: ConversationFileDiff) => fileDiff.isUnstaged || fileDiff.isUntracked || (!fileDiff.isStaged && !fileDiff.isUnstaged && !fileDiff.isUntracked),
    [],
  )
  const displayedFileDiffs = useMemo(() => {
    if (selectedScope === 'staged') {
      return fileDiffs.filter((fileDiff) => fileDiff.isStaged)
    }

    if (selectedScope === 'unstaged') {
      return fileDiffs.filter((fileDiff) => isUnstagedLikeFileDiff(fileDiff))
    }

    return fileDiffs
  }, [fileDiffs, isUnstagedLikeFileDiff, selectedScope])
  const selectedScopeLabel =
    selectedScope === 'unstaged'
      ? 'Unstaged'
      : selectedScope === 'staged'
        ? 'Staged'
        : selectedScope === 'branch'
          ? 'Branch'
          : 'Last turn'
  const unstagedFileCount = useMemo(
    () => fileDiffs.filter((fileDiff) => isUnstagedLikeFileDiff(fileDiff)).length,
    [fileDiffs, isUnstagedLikeFileDiff],
  )
  const stagedFileCount = useMemo(() => fileDiffs.filter((fileDiff) => fileDiff.isStaged).length, [fileDiffs])
  const selectedScopeCount = selectedScope === 'unstaged' ? unstagedFileCount : selectedScope === 'staged' ? stagedFileCount : null
  const expandedFilePathSet = useMemo(() => new Set(expandedFilePaths), [expandedFilePaths])

  const scopeOptions = useMemo(
    () =>
      [
        {
          description: `${unstagedFileCount}`,
          label: 'Unstaged',
          value: 'unstaged',
        },
        {
          description: `${stagedFileCount}`,
          label: 'Staged',
          value: 'staged',
        },
        {
          description: branchLabel,
          label: 'Branch',
          value: 'branch',
        },
        {
          description: null,
          label: 'Last turn',
          value: 'last_turn',
        },
      ] satisfies readonly DiffScopeOption[],
    [branchLabel, stagedFileCount, unstagedFileCount],
  )

  useEffect(() => {
    widthRef.current = width
  }, [width])

  useEffect(() => {
    if (isResizing) {
      return
    }
    setRenderedWidth(width)
  }, [isResizing, width])

  useEffect(() => {
    onWidthChangeRef.current = onWidthChange
  }, [onWidthChange])

  useEffect(() => {
    onWidthCommitRef.current = onWidthCommit
  }, [onWidthCommit])

  useEffect(() => {
    if (isOpen) {
      return
    }

    setIsFullscreen(false)
    setIsScopeMenuOpen(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function clampPanelWidth() {
      const parentWidth = panelRef.current?.parentElement?.clientWidth
      if (!parentWidth) {
        return
      }

      const clampedWidth = Math.min(getMaxDiffPanelWidth(parentWidth), Math.max(MIN_DIFF_PANEL_WIDTH, renderedWidth))
      if (clampedWidth !== renderedWidth) {
        setRenderedWidth(clampedWidth)
        onWidthChangeRef.current(clampedWidth)
      }
    }

    clampPanelWidth()
    window.addEventListener('resize', clampPanelWidth)
    return () => window.removeEventListener('resize', clampPanelWidth)
  }, [isOpen, renderedWidth])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current
      const parentWidth = panelRef.current?.parentElement?.clientWidth
      if (!dragState || !parentWidth) {
        return
      }

      const nextWidth = dragState.startWidth - (event.clientX - dragState.startX)
      const clampedWidth = Math.min(
        getMaxDiffPanelWidth(parentWidth),
        Math.max(MIN_DIFF_PANEL_WIDTH, Math.round(nextWidth)),
      )
      widthRef.current = clampedWidth
      setRenderedWidth(clampedWidth)
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return
      }

      dragStateRef.current = null
      setIsResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      onWidthChangeRef.current(widthRef.current)
      onWidthCommitRef.current?.(widthRef.current)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      dragStateRef.current = null
      setIsResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  useEffect(() => {
    if (!isScopeMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (
        target instanceof Node &&
        !scopeContainerRef.current?.contains(target) &&
        !scopeMenuRef.current?.contains(target)
      ) {
        setIsScopeMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [isScopeMenuOpen])

  useEffect(() => {
    if (!isScopeMenuOpen) {
      return
    }

    setHighlightedScope(selectedScope)
  }, [isScopeMenuOpen, selectedScope])

  useEffect(() => {
    const availableFilePathSet = new Set(fileDiffs.map((fileDiff) => fileDiff.fileName))
    const nextExpandedFilePaths = expandedFilePaths.filter((filePath) => availableFilePathSet.has(filePath))
    if (nextExpandedFilePaths.length !== expandedFilePaths.length) {
      onExpandedFilePathsChange(nextExpandedFilePaths)
    }
  }, [expandedFilePaths, fileDiffs, onExpandedFilePathsChange])

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startWidth: renderedWidth,
      startX: event.clientX,
    }

    setIsResizing(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  function handleSelectScope(nextScope: DiffPanelScope) {
    onSelectedScopeChange(nextScope)
    setIsScopeMenuOpen(false)
  }

  function handleFileExpandedChange(fileName: string, isExpanded: boolean) {
    if (isExpanded) {
      if (expandedFilePathSet.has(fileName)) {
        return
      }

      onExpandedFilePathsChange([...expandedFilePaths, fileName])
      return
    }

    if (!expandedFilePathSet.has(fileName)) {
      return
    }

    onExpandedFilePathsChange(expandedFilePaths.filter((existingFileName) => existingFileName !== fileName))
  }

  function canStageFile(fileDiff: ConversationFileDiff) {
    return isUnstagedLikeFileDiff(fileDiff)
  }

  function canDiscardFile(fileDiff: ConversationFileDiff) {
    return isUnstagedLikeFileDiff(fileDiff)
  }

  function canUnstageFile(fileDiff: ConversationFileDiff) {
    return selectedScope === 'staged' && fileDiff.isStaged
  }

  function getDiscardTooltipLabel(fileDiff: ConversationFileDiff) {
    if (pendingFileActionPath === fileDiff.fileName) {
      return 'Updating file state...'
    }

    if (canDiscardFile(fileDiff)) {
      return 'Discard file changes'
    }

    return 'No unstaged changes for this file'
  }

  function getUnstageTooltipLabel(fileDiff: ConversationFileDiff) {
    if (pendingFileActionPath === fileDiff.fileName) {
      return 'Updating file state...'
    }

    if (canUnstageFile(fileDiff)) {
      return 'Unstage file'
    }

    return 'File is not staged'
  }

  function getStageTooltipLabel(fileDiff: ConversationFileDiff) {
    if (pendingFileActionPath === fileDiff.fileName) {
      return 'Updating file state...'
    }

    if (canStageFile(fileDiff)) {
      return 'Stage file'
    }

    return 'File is already staged'
  }

  const panelIconButtonClassName =
    'inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent'
  const fileActionButtonClassName = `${panelIconButtonClassName} disabled:cursor-not-allowed disabled:text-muted-foreground/50 disabled:hover:bg-transparent`

  function renderScopeOption(option: DiffScopeOption) {
    const isSelected = option.value === selectedScope
    const isHighlighted = option.value === highlightedScope

    return (
      <button
        key={option.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => setHighlightedScope(option.value)}
        onClick={() => handleSelectScope(option.value)}
        className={[
          'flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left transition-[background-color,color,box-shadow]',
          isHighlighted
            ? 'bg-[var(--dropdown-option-active-surface)] text-foreground shadow-sm'
            : 'text-foreground hover:bg-[var(--dropdown-option-active-surface)]',
        ].join(' ')}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-5">{option.label}</span>
          {option.description ? (
            <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">{option.description}</span>
          ) : null}
        </span>
        {isSelected ? <Check size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-foreground" /> : null}
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className={[
        isFullscreen
          ? 'absolute inset-0 z-30 flex h-full min-w-0 overflow-hidden'
          : 'relative hidden h-full shrink-0 overflow-hidden md:flex',
      ].join(' ')}
      style={isFullscreen ? undefined : { width: `${renderedWidth}px` }}
    >
      {!isFullscreen && isOpen ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize diff panel"
          onPointerDown={handleResizePointerDown}
          className="absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
        />
      ) : null}

      <aside className="flex h-full min-w-0 flex-1 flex-col border-l border-border bg-[var(--workspace-panel-surface)]">
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <div ref={scopeContainerRef} className="relative w-fit max-w-full">
            <button
              ref={scopeButtonRef}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isScopeMenuOpen}
              data-open={isScopeMenuOpen ? 'true' : 'false'}
              onClick={() => setIsScopeMenuOpen((currentValue) => !currentValue)}
              className="inline-flex h-8 items-center gap-2 text-sm text-foreground transition-colors hover:text-muted-foreground"
            >
              <span className="font-semibold">{selectedScopeLabel}</span>
              {selectedScopeCount !== null ? (
                <span className="text-sm font-semibold text-muted-foreground">{selectedScopeCount}</span>
              ) : null}
              <ChevronDown
                size={14}
                className={['text-muted-foreground transition-transform duration-200', isScopeMenuOpen ? 'rotate-180' : ''].join(
                  ' ',
                )}
              />
            </button>

            {isScopeMenuOpen
              ? createPortal(
                  <div
                    ref={scopeMenuRef}
                    data-floating-menu-root="true"
                    className="fixed z-40 w-[min(18rem,calc(100vw-1rem))] min-w-[10rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
                    style={menuStyle}
                  >
                    <div
                      role="listbox"
                      aria-label="Diff scopes"
                      onMouseLeave={() => setHighlightedScope(selectedScope)}
                      className="max-h-56 space-y-0 overflow-y-auto"
                    >
                      {scopeOptions.map((option) => renderScopeOption(option))}
                    </div>
                  </div>,
                  document.body,
                )
              : null}
          </div>

          <Tooltip content={isFullscreen ? 'Exit fullscreen diff panel' : 'Fullscreen diff panel'} side="left" noWrap>
            <button
              type="button"
              aria-label={isFullscreen ? 'Exit fullscreen diff panel' : 'Fullscreen diff panel'}
              onClick={() => setIsFullscreen((currentValue) => !currentValue)}
              className={panelIconButtonClassName}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </Tooltip>
        </div>

        <div className="h-px w-full bg-border" />

        {displayedFileDiffs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
            {selectedScope === 'staged'
              ? 'No staged file diffs available.'
              : 'No changed files were detected for this branch.'}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {displayedFileDiffs.map((diff) => (
              <DiffViewer
                key={diff.fileName}
                collapsible
                defaultExpanded={false}
                filePath={diff.fileName}
                isExpanded={expandedFilePathSet.has(diff.fileName)}
                newContent={diff.newContent}
                onExpandedChange={(nextValue) => handleFileExpandedChange(diff.fileName, nextValue)}
                oldContent={diff.oldContent}
                contextLines={diff.contextLines}
                layout="stacked"
                startLineNumber={diff.startLineNumber}
                headerInlineContent={
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">{`+${diff.addedLineCount}`}</span>
                    <span className="text-red-600 dark:text-red-400">{`-${diff.removedLineCount}`}</span>
                  </span>
                }
                headerRightContent={
                  <span className="inline-flex items-center gap-0.5">
                    {selectedScope === 'staged' ? (
                      pendingFileActionPath === diff.fileName ? (
                        <button
                          type="button"
                          aria-label={`Unstage ${diff.fileName}`}
                          disabled={!canUnstageFile(diff) || pendingFileActionPath === diff.fileName}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void onUnstageFile(diff.fileName)
                          }}
                          className={fileActionButtonClassName}
                        >
                          <Minus size={14} />
                        </button>
                      ) : (
                        <Tooltip content={getUnstageTooltipLabel(diff)} side="left" noWrap>
                          <button
                            type="button"
                            aria-label={`Unstage ${diff.fileName}`}
                            disabled={!canUnstageFile(diff) || pendingFileActionPath === diff.fileName}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void onUnstageFile(diff.fileName)
                            }}
                            className={fileActionButtonClassName}
                          >
                            <Minus size={14} />
                          </button>
                        </Tooltip>
                      )
                    ) : (
                      <>
                        <Tooltip content={getDiscardTooltipLabel(diff)} side="left" noWrap>
                          <button
                            type="button"
                            aria-label={`Discard ${diff.fileName}`}
                            disabled={!canDiscardFile(diff) || pendingFileActionPath === diff.fileName}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void onDiscardFile(diff.fileName)
                            }}
                            className={fileActionButtonClassName}
                          >
                            <Undo2 size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip content={getStageTooltipLabel(diff)} side="left" noWrap>
                          <button
                            type="button"
                            aria-label={`Stage ${diff.fileName}`}
                            disabled={!canStageFile(diff) || pendingFileActionPath === diff.fileName}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void onStageFile(diff.fileName)
                            }}
                            className={fileActionButtonClassName}
                          >
                            <Plus size={14} />
                          </button>
                        </Tooltip>
                      </>
                    )}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}
