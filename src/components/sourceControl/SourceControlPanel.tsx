import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  Loader2,
  LocateFixed,
  RefreshCw,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ConversationFileDiff } from '../../lib/chatDiffs'
import { MIN_DIFF_PANEL_WIDTH, getMaxDiffPanelWidth } from '../../lib/diffPanelSizing'
import type {
  GitHistoryCommitDetailsResult,
  GitHistoryCommitFile,
  GitHistoryEntry,
  GitSyncAction,
} from '../../types/chat'
import { Tooltip } from '../Tooltip'
import { Switch } from '../ui/Switch'
import { CommitFileRow } from './CommitFileRow'
import { CommitHistoryTooltipContent } from './CommitHistoryTooltipContent'
import { GitGraphLane, GitGraphPlaceholder } from './historyGraph'
import { computeSwimlanes, getSwimlaneIndentPx } from './historyGraphLayout'
import { SourceControlDiffSection } from './SourceControlDiffSection'

interface SourceControlPanelProps {
  fileDiffs: readonly ConversationFileDiff[]
  isOpen: boolean
  onDiscardFile: (filePath: string) => Promise<void>
  onOpenCommitModal: () => void
  onQuickCommit: (input: { includeUnstaged: boolean; message: string }) => Promise<void>
  onRefreshAll: () => Promise<void>
  onSectionOpenChange: (nextValue: Record<'changes' | 'commit' | 'history' | 'staged' | 'unstaged', boolean>) => void
  onStageFile: (filePath: string) => Promise<void>
  onUnstageFile: (filePath: string) => Promise<void>
  onWidthChange: (nextWidth: number) => void
  onWidthCommit?: (nextWidth: number) => void
  pendingFileActionPath: string | null
  sectionOpen: Record<'changes' | 'commit' | 'history' | 'staged' | 'unstaged', boolean>
  width: number
  workspacePath: string | null | undefined
}

interface SyncActionConfig {
  action: GitSyncAction
  icon: LucideIcon
  label: string
}

const SYNC_ACTIONS: readonly SyncActionConfig[] = [
  {
    action: 'fetch-all',
    icon: Upload,
    label: 'Fetch all remotes',
  },
  {
    action: 'pull',
    icon: ArrowDownToLine,
    label: 'Pull latest changes',
  },
  {
    action: 'push',
    icon: ArrowUpToLine,
    label: 'Push current branch',
  },
]

const HISTORY_PAGE_SIZE = 200

export function SourceControlPanel({
  fileDiffs,
  isOpen,
  onDiscardFile,
  onOpenCommitModal,
  onQuickCommit,
  onRefreshAll,
  onSectionOpenChange,
  onStageFile,
  onUnstageFile,
  onWidthChange,
  onWidthCommit,
  pendingFileActionPath,
  sectionOpen,
  width,
  workspacePath,
}: SourceControlPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelBodyRef = useRef<HTMLDivElement | null>(null)
  const historyRowRefMap = useRef(new Map<string, HTMLButtonElement | null>())
  const dragStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const historyResizeStateRef = useRef<{
    containerHeight: number
    pointerId: number
    startHeight: number
    startY: number
  } | null>(null)
  const widthRef = useRef(width)
  const onWidthChangeRef = useRef(onWidthChange)
  const onWidthCommitRef = useRef(onWidthCommit)
  const [isResizing, setIsResizing] = useState(false)
  const [isHistoryResizing, setIsHistoryResizing] = useState(false)
  const [historyHeight, setHistoryHeight] = useState<number | null>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [includeUnstaged, setIncludeUnstaged] = useState(true)
  const [isQuickCommitting, setIsQuickCommitting] = useState(false)
  const [quickCommitError, setQuickCommitError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [pendingSyncAction, setPendingSyncAction] = useState<GitSyncAction | 'refresh' | null>(null)
  const [historyEntries, setHistoryEntries] = useState<GitHistoryEntry[]>([])
  const [headHash, setHeadHash] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null)
  const [expandedChangeFilePaths, setExpandedChangeFilePaths] = useState<string[]>([])
  const [expandedCommitHashes, setExpandedCommitHashes] = useState<string[]>([])
  const [commitDetailsByHash, setCommitDetailsByHash] = useState<Record<string, GitHistoryCommitDetailsResult>>({})
  const [loadingCommitHashes, setLoadingCommitHashes] = useState<string[]>([])
  const [isChangesSectionOpen, setIsChangesSectionOpen] = useState(sectionOpen.changes)
  const [isHistorySectionOpen, setIsHistorySectionOpen] = useState(sectionOpen.history)
  const [isStagedSectionOpen, setIsStagedSectionOpen] = useState(sectionOpen.staged)
  const [isUnstagedSectionOpen, setIsUnstagedSectionOpen] = useState(sectionOpen.unstaged)

  const normalizedWorkspacePath = workspacePath?.trim() ?? ''
  const hasWorkspacePath = normalizedWorkspacePath.length > 0
  const visiblePanelWidth = isOpen ? width : 0
  const isUnstagedLikeFileDiff = useCallback(
    (fileDiff: ConversationFileDiff) =>
      fileDiff.isUnstaged || fileDiff.isUntracked || (!fileDiff.isStaged && !fileDiff.isUnstaged && !fileDiff.isUntracked),
    [],
  )
  const stagedFileDiffs = useMemo(() => fileDiffs.filter((fileDiff) => fileDiff.isStaged), [fileDiffs])
  const unstagedFileDiffs = useMemo(
    () => fileDiffs.filter((fileDiff) => isUnstagedLikeFileDiff(fileDiff)),
    [fileDiffs, isUnstagedLikeFileDiff],
  )
  const totalChangedFileCount = fileDiffs.length
  const canQuickCommit =
    !isQuickCommitting &&
    (includeUnstaged ? totalChangedFileCount > 0 : stagedFileDiffs.length > 0)

  const historyViewModels = useMemo(() => computeSwimlanes(historyEntries), [historyEntries])

  useEffect(() => {
    if (isChangesSectionOpen !== sectionOpen.changes) {
      setIsChangesSectionOpen(sectionOpen.changes)
    }
    if (isHistorySectionOpen !== sectionOpen.history) {
      setIsHistorySectionOpen(sectionOpen.history)
    }
    if (isStagedSectionOpen !== sectionOpen.staged) {
      setIsStagedSectionOpen(sectionOpen.staged)
    }
    if (isUnstagedSectionOpen !== sectionOpen.unstaged) {
      setIsUnstagedSectionOpen(sectionOpen.unstaged)
    }
  }, [
    isChangesSectionOpen,
    isHistorySectionOpen,
    isStagedSectionOpen,
    isUnstagedSectionOpen,
    sectionOpen.changes,
    sectionOpen.history,
    sectionOpen.staged,
    sectionOpen.unstaged,
  ])

  const persistSectionOpen = useCallback(
    (nextValue: Partial<Record<'changes' | 'commit' | 'history' | 'staged' | 'unstaged', boolean>>) => {
      onSectionOpenChange({
        ...sectionOpen,
        ...nextValue,
      })
    },
    [onSectionOpenChange, sectionOpen],
  )

  useEffect(() => {
    widthRef.current = width
  }, [width])

  useEffect(() => {
    onWidthChangeRef.current = onWidthChange
  }, [onWidthChange])

  useEffect(() => {
    onWidthCommitRef.current = onWidthCommit
  }, [onWidthCommit])

  useEffect(() => {
    function clampPanelWidth() {
      const parentWidth = panelRef.current?.parentElement?.clientWidth
      if (!parentWidth) {
        return
      }

      const clampedWidth = Math.min(getMaxDiffPanelWidth(parentWidth), Math.max(MIN_DIFF_PANEL_WIDTH, width))
      if (clampedWidth !== width) {
        onWidthChangeRef.current(clampedWidth)
      }
    }

    clampPanelWidth()
    window.addEventListener('resize', clampPanelWidth)
    return () => window.removeEventListener('resize', clampPanelWidth)
  }, [width])

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
      onWidthChangeRef.current(clampedWidth)
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return
      }

      dragStateRef.current = null
      setIsResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
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
    function handleHistoryPointerMove(event: PointerEvent) {
      const resizeState = historyResizeStateRef.current
      if (!resizeState) {
        return
      }

      const nextHeight = clampHistoryHeight(
        resizeState.startHeight + (resizeState.startY - event.clientY),
        resizeState.containerHeight,
      )
      setHistoryHeight(nextHeight)
    }

    function handleHistoryPointerUp(event: PointerEvent) {
      if (historyResizeStateRef.current?.pointerId !== event.pointerId) {
        return
      }

      historyResizeStateRef.current = null
      setIsHistoryResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    window.addEventListener('pointermove', handleHistoryPointerMove)
    window.addEventListener('pointerup', handleHistoryPointerUp)

    return () => {
      window.removeEventListener('pointermove', handleHistoryPointerMove)
      window.removeEventListener('pointerup', handleHistoryPointerUp)
      historyResizeStateRef.current = null
      setIsHistoryResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  useEffect(() => {
    if (!isHistorySectionOpen || historyHeight === null) {
      return
    }

    const containerHeight = panelBodyRef.current?.clientHeight
    if (!containerHeight) {
      return
    }

    const clampedHeight = clampHistoryHeight(historyHeight, containerHeight)
    if (clampedHeight !== historyHeight) {
      setHistoryHeight(clampedHeight)
    }
  }, [historyHeight, isHistorySectionOpen])

  const loadHistoryPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!hasWorkspacePath) {
        return
      }

      const result = await window.echosphereGit.getHistoryPage({
        limit: HISTORY_PAGE_SIZE,
        offset,
        workspacePath: normalizedWorkspacePath,
      })

      setHeadHash(result.headHash)
      setHasMoreHistory(result.hasMore)
      setHistoryEntries((currentEntries) => (append ? [...currentEntries, ...result.entries] : result.entries))
      setSelectedCommitHash((currentSelectedHash) => {
        if (currentSelectedHash && result.entries.some((entry) => entry.hash === currentSelectedHash)) {
          return currentSelectedHash
        }

        if (result.headHash && result.entries.some((entry) => entry.hash === result.headHash)) {
          return result.headHash
        }

        return result.entries[0]?.hash ?? null
      })
    },
    [hasWorkspacePath, normalizedWorkspacePath],
  )

  const refreshHistory = useCallback(async () => {
    if (!hasWorkspacePath) {
      setHistoryEntries([])
      setHeadHash(null)
      setHasMoreHistory(false)
      setHistoryError(null)
      setSelectedCommitHash(null)
      setExpandedCommitHashes([])
      setCommitDetailsByHash({})
      setLoadingCommitHashes([])
      return
    }

    setIsLoadingHistory(true)
    setHistoryError(null)
    try {
      await loadHistoryPage(0, false)
    } catch (error) {
      setHistoryEntries([])
      setHeadHash(null)
      setHasMoreHistory(false)
      setHistoryError(error instanceof Error ? error.message : 'Failed to load git history.')
    } finally {
      setIsLoadingHistory(false)
    }
  }, [hasWorkspacePath, loadHistoryPage])

  const loadMoreHistory = useCallback(async () => {
    if (!hasWorkspacePath || !hasMoreHistory || isLoadingMoreHistory) {
      return
    }

    setIsLoadingMoreHistory(true)
    setHistoryError(null)
    try {
      await loadHistoryPage(historyEntries.length, true)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to load more history.')
    } finally {
      setIsLoadingMoreHistory(false)
    }
  }, [hasMoreHistory, hasWorkspacePath, historyEntries.length, isLoadingMoreHistory, loadHistoryPage])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    void refreshHistory()
  }, [isOpen, refreshHistory, normalizedWorkspacePath])

  const loadCommitDetails = useCallback(
    async (commitHash: string) => {
      if (!hasWorkspacePath || commitDetailsByHash[commitHash] || loadingCommitHashes.includes(commitHash)) {
        return
      }

      setLoadingCommitHashes((currentValue) => [...currentValue, commitHash])
      try {
        const details = await window.echosphereGit.getHistoryCommitDetails({
          commitHash,
          workspacePath: normalizedWorkspacePath,
        })
        setCommitDetailsByHash((currentValue) => ({
          ...currentValue,
          [commitHash]: details,
        }))
      } catch (error) {
        setHistoryError(error instanceof Error ? error.message : 'Failed to load commit details.')
      } finally {
        setLoadingCommitHashes((currentValue) => currentValue.filter((value) => value !== commitHash))
      }
    },
    [commitDetailsByHash, hasWorkspacePath, loadingCommitHashes, normalizedWorkspacePath],
  )

  async function handleSyncAction(action: GitSyncAction) {
    if (!hasWorkspacePath) {
      return
    }

    setPendingSyncAction(action)
    setSyncError(null)
    setSyncMessage(null)
    try {
      const result = await window.echosphereGit.sync({
        action,
        workspacePath: normalizedWorkspacePath,
      })
      setSyncMessage(result.message)
      await Promise.all([onRefreshAll(), refreshHistory()])
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : `Failed to ${action}.`)
    } finally {
      setPendingSyncAction(null)
    }
  }

  async function handleRefreshPanel() {
    setPendingSyncAction('refresh')
    setSyncError(null)
    setSyncMessage(null)
    try {
      await Promise.all([onRefreshAll(), refreshHistory()])
      setSyncMessage('Source control refreshed.')
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Failed to refresh source control.')
    } finally {
      setPendingSyncAction(null)
    }
  }

  async function handleQuickCommitSubmit() {
    if (!canQuickCommit) {
      return
    }

    setIsQuickCommitting(true)
    setQuickCommitError(null)

    try {
      await onQuickCommit({
        includeUnstaged,
        message: commitMessage,
      })

      setCommitMessage('')
      setSyncMessage('Committed changes.')
      setSyncError(null)
      await refreshHistory()
    } catch (error) {
      setQuickCommitError(error instanceof Error ? error.message : 'Failed to commit changes.')
    } finally {
      setIsQuickCommitting(false)
    }
  }

  async function handleGoToCurrentCommit() {
    if (!headHash) {
      return
    }

    if (!historyEntries.some((entry) => entry.hash === headHash) && hasMoreHistory) {
      await loadMoreHistory()
    }

    setSelectedCommitHash(headHash)
    requestAnimationFrame(() => {
      historyRowRefMap.current.get(headHash)?.scrollIntoView({
        block: 'center',
      })
    })
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startWidth: widthRef.current,
      startX: event.clientX,
    }

    setIsResizing(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  function clampHistoryHeight(nextHeight: number, containerHeight: number) {
    const minHistoryHeight = 140
    const minNonHistoryHeight = 160
    const maxHistoryHeight = Math.max(minHistoryHeight, containerHeight - minNonHistoryHeight)
    return Math.min(maxHistoryHeight, Math.max(minHistoryHeight, Math.round(nextHeight)))
  }

  function handleHistoryResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isHistorySectionOpen) {
      return
    }

    const containerHeight = panelBodyRef.current?.clientHeight
    if (!containerHeight) {
      return
    }

    const startHeight = historyHeight ?? Math.round(containerHeight * 0.45)
    historyResizeStateRef.current = {
      containerHeight,
      pointerId: event.pointerId,
      startHeight,
      startY: event.clientY,
    }
    setHistoryHeight(startHeight)
    setIsHistoryResizing(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
  }

  function handleChangeFileExpandedChange(filePath: string, nextValue: boolean) {
    setExpandedChangeFilePaths((currentValue) =>
      nextValue ? [...currentValue, filePath] : currentValue.filter((value) => value !== filePath),
    )
  }

  function handleCommitExpandedToggle(commitHash: string) {
    const shouldExpand = !expandedCommitHashes.includes(commitHash)
    setSelectedCommitHash(commitHash)
    setExpandedCommitHashes((currentValue) =>
      shouldExpand ? [...currentValue, commitHash] : currentValue.filter((value) => value !== commitHash),
    )

    if (shouldExpand) {
      void loadCommitDetails(commitHash)
    }
  }

  function renderCommitDetails(commitHash: string, files: readonly GitHistoryCommitFile[], laneColumnCount: number) {
    const isLoadingCommitDetails = loadingCommitHashes.includes(commitHash)
    const indentPx = getSwimlaneIndentPx(laneColumnCount)

    if (isLoadingCommitDetails) {
      return (
        <div className="flex items-center gap-2 py-2 pr-3 text-[12px] text-muted-foreground" style={{ paddingLeft: `${indentPx + 12}px` }}>
          <Loader2 size={13} className="animate-spin" />
          Loading files...
        </div>
      )
    }

    if (files.length === 0) {
      return (
        <div className="py-2 pr-3 text-[12px] text-muted-foreground" style={{ paddingLeft: `${indentPx + 12}px` }}>
          No changed files.
        </div>
      )
    }

    return (
      <div className="flex flex-col">
        {files.map((file) => (
          <CommitFileRow key={`${commitHash}-${file.path}`} file={file} indentPx={indentPx} />
        ))}
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className={[
        'relative hidden h-full shrink-0 overflow-hidden md:flex',
        isResizing ? '' : 'transition-[width,opacity] duration-300 ease-out',
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      style={{ width: `${visiblePanelWidth}px` }}
      aria-hidden={!isOpen}
    >
      {isOpen ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize source control panel"
          onPointerDown={handleResizePointerDown}
          className="absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
        />
      ) : null}

      <aside className="flex h-full min-w-0 flex-1 flex-col border-l border-border bg-[var(--workspace-panel-surface)]">
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-2">
            <GitCommitHorizontal size={16} className="text-muted-foreground" />
            <span className="truncate text-sm font-semibold text-foreground">SOURCE CONTROL</span>
          </div>
        </div>

        <div className="h-px w-full bg-border" />

        <div
          ref={panelBodyRef}
          className={[
            'min-h-0 flex flex-1 flex-col overflow-hidden',
            isHistoryResizing ? 'cursor-row-resize' : '',
          ].join(' ')}
        >
          <section className={['border-b border-border', isChangesSectionOpen ? 'min-h-0 flex flex-1 flex-col' : 'shrink-0'].join(' ')}>
            <button
              type="button"
              onClick={() => {
                const nextValue = !isChangesSectionOpen
                setIsChangesSectionOpen(nextValue)
                persistSectionOpen({ changes: nextValue })
              }}
              className="flex h-10 w-full items-center justify-between px-4 text-left"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Changes</span>
              <ChevronDown size={13} className={['text-muted-foreground transition-transform', isChangesSectionOpen ? '' : '-rotate-90'].join(' ')} />
            </button>
            <div className={['min-h-0 border-t border-border transition-[opacity] duration-200', isChangesSectionOpen ? 'flex flex-1 flex-col opacity-100' : 'hidden opacity-0'].join(' ')}>
              <div className="shrink-0 border-b border-border px-4 py-3">
                <textarea
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  rows={3}
                  placeholder="Commit message (leave empty to auto-generate with AI)"
                  className="w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle-foreground"
                />

                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={includeUnstaged} onChange={setIncludeUnstaged} disabled={isQuickCommitting} />
                    Include unstaged
                  </label>

                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isQuickCommitting || !canQuickCommit}
                      onClick={() => void handleQuickCommitSubmit()}
                      className={[
                        'inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium transition-colors',
                        isQuickCommitting || !canQuickCommit ? 'chat-send-button-disabled cursor-not-allowed' : 'chat-send-button-enabled',
                      ].join(' ')}
                    >
                      {isQuickCommitting ? 'Committing...' : 'Commit'}
                    </button>
                    <button
                      type="button"
                      onClick={onOpenCommitModal}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Advanced
                    </button>
                  </div>
                </div>

                {quickCommitError ? <p className="mt-2 text-xs text-danger-foreground">{quickCommitError}</p> : null}
                {syncError ? <p className="mt-2 text-xs text-danger-foreground">{syncError}</p> : null}
                {!syncError && syncMessage ? <p className="mt-2 text-xs text-muted-foreground">{syncMessage}</p> : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {stagedFileDiffs.length > 0 ? (
                  <section className="shrink-0 border-b border-border">
                    <button
                      type="button"
                      onClick={() => {
                        const nextValue = !isStagedSectionOpen
                        setIsStagedSectionOpen(nextValue)
                        persistSectionOpen({ staged: nextValue })
                      }}
                      className="flex h-10 w-full items-center justify-between px-4 text-left"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Staged Changes</span>
                      <ChevronDown size={13} className={['text-muted-foreground transition-transform', isStagedSectionOpen ? '' : '-rotate-90'].join(' ')} />
                    </button>
                    <div className={['transition-[opacity] duration-200', isStagedSectionOpen ? 'border-t border-border opacity-100' : 'hidden opacity-0'].join(' ')}>
                      <SourceControlDiffSection
                        sectionClassName="border-b-0"
                        title=""
                        scope="staged"
                        diffs={stagedFileDiffs}
                        emptyLabel="No staged files."
                        expandedFilePaths={expandedChangeFilePaths}
                        pendingFileActionPath={pendingFileActionPath}
                        onDiscardFile={onDiscardFile}
                        onExpandedChange={handleChangeFileExpandedChange}
                        onStageFile={onStageFile}
                        onUnstageFile={onUnstageFile}
                      />
                    </div>
                  </section>
                ) : null}

                <section className={['border-border', isUnstagedSectionOpen ? 'border-b-0' : 'border-b'].join(' ')}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextValue = !isUnstagedSectionOpen
                      setIsUnstagedSectionOpen(nextValue)
                      persistSectionOpen({ unstaged: nextValue })
                    }}
                    className="flex h-10 w-full items-center justify-between px-4 text-left"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Changes</span>
                    <ChevronDown size={13} className={['text-muted-foreground transition-transform', isUnstagedSectionOpen ? '' : '-rotate-90'].join(' ')} />
                  </button>
                  <div className={['transition-[opacity] duration-200', isUnstagedSectionOpen ? 'border-t border-border opacity-100' : 'hidden opacity-0'].join(' ')}>
                    <SourceControlDiffSection
                      sectionClassName="border-b-0"
                      title=""
                      scope="unstaged"
                      diffs={unstagedFileDiffs}
                      emptyLabel="No unstaged files."
                      expandedFilePaths={expandedChangeFilePaths}
                      pendingFileActionPath={pendingFileActionPath}
                      onDiscardFile={onDiscardFile}
                      onExpandedChange={handleChangeFileExpandedChange}
                      onStageFile={onStageFile}
                      onUnstageFile={onUnstageFile}
                    />
                  </div>
                </section>
              </div>
            </div>
          </section>

          <section
            className={[
              'border-b border-border',
              isHistorySectionOpen ? 'min-h-0 shrink-0 flex flex-1 flex-col' : 'shrink-0',
            ].join(' ')}
            style={
              isHistorySectionOpen && historyHeight !== null
                ? {
                    flex: '0 0 auto',
                    height: `${historyHeight}px`,
                  }
                : undefined
            }
          >
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize history section"
              onPointerDown={handleHistoryResizePointerDown}
              className={[
                'h-1 w-full bg-transparent',
                isHistorySectionOpen ? 'cursor-row-resize' : 'cursor-default',
              ].join(' ')}
            />
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isHistorySectionOpen}
              onClick={() => {
                const nextValue = !isHistorySectionOpen
                setIsHistorySectionOpen(nextValue)
                persistSectionOpen({ history: nextValue })
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return
                }

                event.preventDefault()
                const nextValue = !isHistorySectionOpen
                setIsHistorySectionOpen(nextValue)
                persistSectionOpen({ history: nextValue })
              }}
              className="flex h-10 cursor-pointer items-center justify-between px-4"
            >
              <span className="inline-flex items-center gap-2 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">History</span>
                <ChevronDown
                  size={13}
                  className={['text-muted-foreground transition-transform', isHistorySectionOpen ? '' : '-rotate-90'].join(' ')}
                />
              </span>
              <div className="inline-flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
                {SYNC_ACTIONS.map((config) => {
                  const Icon = config.icon
                  const isPending = pendingSyncAction === config.action

                  return (
                    <Tooltip key={config.action} content={config.label} side="top">
                      <button
                        type="button"
                        aria-label={config.label}
                        disabled={!hasWorkspacePath || pendingSyncAction !== null}
                        onClick={() => void handleSyncAction(config.action)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPending ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                      </button>
                    </Tooltip>
                  )
                })}

                <Tooltip content="Refresh source control" side="top">
                  <button
                    type="button"
                    aria-label="Refresh source control"
                    disabled={!hasWorkspacePath || pendingSyncAction !== null}
                    onClick={() => void handleRefreshPanel()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendingSyncAction === 'refresh' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  </button>
                </Tooltip>

                <Tooltip content="Go to HEAD commit" side="top">
                  <button
                    type="button"
                    aria-label="Go to HEAD commit"
                    disabled={!headHash}
                    onClick={() => void handleGoToCurrentCommit()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LocateFixed size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className={['min-h-0 flex-1 overflow-y-auto border-t border-border transition-[opacity] duration-200', isHistorySectionOpen ? 'opacity-100' : 'hidden opacity-0'].join(' ')}>
              {isLoadingHistory ? (
                <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Loading history...
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="px-4 py-3">
                  <div className="flex min-h-16 items-center text-[12px] text-muted-foreground">No commits yet.</div>
                </div>
              ) : (
                <div>
                  {historyViewModels.map((viewModel) => {
                    const { entry } = viewModel
                    const isExpanded = expandedCommitHashes.includes(entry.hash)
                    const isSelected = selectedCommitHash === entry.hash
                    const commitDetails = commitDetailsByHash[entry.hash]
                    const isLoadingDetails = loadingCommitHashes.includes(entry.hash)
                    const continuationColumns =
                      viewModel.outputSwimlanes.length > 0 ? viewModel.outputSwimlanes : viewModel.inputSwimlanes

                    return (
                      <div key={entry.hash}>
                        <Tooltip
                          content={
                            <CommitHistoryTooltipContent
                              entry={entry}
                              details={commitDetails}
                              isLoadingDetails={isLoadingDetails}
                            />
                          }
                          side="right"
                          fullWidthTrigger
                          interactive
                          hideDelayMs={220}
                          panelClassName="!max-w-[min(42rem,calc(100vw-24px))] !border-0 !bg-transparent !p-0 !text-left !shadow-none"
                        >
                          <button
                            type="button"
                            ref={(node) => {
                              historyRowRefMap.current.set(entry.hash, node)
                            }}
                            onClick={() => handleCommitExpandedToggle(entry.hash)}
                            onMouseEnter={() => {
                              void loadCommitDetails(entry.hash)
                            }}
                            onFocus={() => {
                              void loadCommitDetails(entry.hash)
                            }}
                            className={[
                              'flex h-[50px] w-full items-center gap-0 text-left transition-colors',
                              isSelected ? 'bg-surface-muted' : 'hover:bg-surface-muted/50',
                            ].join(' ')}
                          >
                            <GitGraphLane viewModel={viewModel} />

                            <span className="min-w-0 flex-1 py-1.5 pr-2">
                              <span className="flex items-center gap-1.5">
                                <span className="min-w-0 shrink truncate text-[13px] font-medium leading-5 text-foreground">
                                  {entry.subject.length > 0 ? entry.subject : '(no subject)'}
                                </span>
                                <span className="ml-auto shrink-0 pl-2 text-subtle-foreground">
                                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </span>
                              </span>
                            </span>
                          </button>
                        </Tooltip>

                        {isExpanded ? (
                          <div className="relative flex bg-surface-muted/10">
                            <div className="z-10 min-w-0 flex-1">
                              {renderCommitDetails(entry.hash, commitDetails?.files ?? [], continuationColumns.length)}
                            </div>
                            <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-fit">
                              <GitGraphPlaceholder columns={continuationColumns} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  {historyError ? <p className="px-4 py-2 text-xs text-danger-foreground">{historyError}</p> : null}

                  {hasMoreHistory ? (
                    <div className="px-4 py-3">
                      <button
                        type="button"
                        disabled={isLoadingMoreHistory}
                        onClick={() => void loadMoreHistory()}
                        className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-border bg-surface-muted/50 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isLoadingMoreHistory ? (
                          <>
                            <Loader2 size={13} className="mr-1.5 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Load more commits'
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
