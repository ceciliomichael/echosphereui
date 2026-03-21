import { ChevronRight, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { clampWorkspaceExplorerWidth } from '../../lib/workspaceExplorerSizing'
import type { WorkspaceExplorerEntry } from '../../types/chat'

interface WorkspaceExplorerPanelProps {
  activeFilePath: string | null
  isOpen: boolean
  onOpenFile: (relativePath: string) => void
  onWidthChange: (nextWidth: number) => void
  onWidthCommit: (nextWidth: number) => void
  width: number
  workspaceRootPath: string | null
}

const ROOT_DIRECTORY_KEY = '.'

function toDirectoryKey(relativePath: string | undefined) {
  const normalized = (relativePath ?? ROOT_DIRECTORY_KEY).trim()
  return normalized.length === 0 ? ROOT_DIRECTORY_KEY : normalized
}

export function WorkspaceExplorerPanel({
  activeFilePath,
  isOpen,
  onOpenFile,
  onWidthChange,
  onWidthCommit,
  width,
  workspaceRootPath,
}: WorkspaceExplorerPanelProps) {
  const [directoryEntriesByPath, setDirectoryEntriesByPath] = useState<Record<string, WorkspaceExplorerEntry[]>>({})
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set())
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(() => new Set())
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [renderedWidth, setRenderedWidth] = useState(width)
  const [isResizing, setIsResizing] = useState(false)
  const dragStateRef = useRef<{ pointerId: number; startWidth: number; startX: number } | null>(null)
  const isWorkspaceConfigured = typeof workspaceRootPath === 'string' && workspaceRootPath.trim().length > 0

  const loadDirectory = useCallback(
    async (relativePath?: string) => {
      if (!workspaceRootPath) {
        return
      }
      const targetPath = toDirectoryKey(relativePath)
      setLoadingDirectories((current) => new Set(current).add(targetPath))
      try {
        const entries = await window.echosphereWorkspace.listDirectory({
          relativePath: targetPath === ROOT_DIRECTORY_KEY ? undefined : targetPath,
          workspaceRootPath,
        })
        setDirectoryEntriesByPath((current) => ({
          ...current,
          [targetPath]: entries,
        }))
        setErrorMessage(null)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load workspace files.')
      } finally {
        setLoadingDirectories((current) => {
          const nextState = new Set(current)
          nextState.delete(targetPath)
          return nextState
        })
      }
    },
    [workspaceRootPath],
  )

  useEffect(() => {
    setDirectoryEntriesByPath({})
    setExpandedDirectories(new Set())
    setLoadingDirectories(new Set())
    setErrorMessage(null)
  }, [workspaceRootPath])

  useEffect(() => {
    if (isResizing) {
      return
    }
    setRenderedWidth(width)
  }, [isResizing, width])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleWindowResize() {
      const clampedWidth = clampWorkspaceExplorerWidth(renderedWidth, window.innerWidth)
      if (clampedWidth !== renderedWidth) {
        setRenderedWidth(clampedWidth)
        onWidthChange(clampedWidth)
      }
    }

    handleWindowResize()
    window.addEventListener('resize', handleWindowResize)
    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [isOpen, onWidthChange, renderedWidth])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }

      const nextWidth = clampWorkspaceExplorerWidth(dragState.startWidth - (event.clientX - dragState.startX), window.innerWidth)
      setRenderedWidth(nextWidth)
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragStateRef.current?.pointerId !== event.pointerId) {
        return
      }

      const dragState = dragStateRef.current
      dragStateRef.current = null
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      if (!dragState) {
        return
      }

      const committedWidth = clampWorkspaceExplorerWidth(
        dragState.startWidth - (event.clientX - dragState.startX),
        window.innerWidth,
      )
      setRenderedWidth(committedWidth)
      onWidthChange(committedWidth)
      onWidthCommit(committedWidth)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      dragStateRef.current = null
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [onWidthChange, onWidthCommit])

  useEffect(() => {
    if (!isOpen || !workspaceRootPath) {
      return
    }
    void loadDirectory(ROOT_DIRECTORY_KEY)
  }, [isOpen, loadDirectory, workspaceRootPath])

  const rootEntries = useMemo(() => directoryEntriesByPath[ROOT_DIRECTORY_KEY] ?? [], [directoryEntriesByPath])

  function toggleDirectory(directory: WorkspaceExplorerEntry) {
    const directoryPath = toDirectoryKey(directory.relativePath)
    setExpandedDirectories((current) => {
      const nextState = new Set(current)
      if (nextState.has(directoryPath)) {
        nextState.delete(directoryPath)
      } else {
        nextState.add(directoryPath)
      }
      return nextState
    })

    if (!directoryEntriesByPath[directoryPath]) {
      void loadDirectory(directoryPath)
    }
  }

  function renderEntries(entries: readonly WorkspaceExplorerEntry[], depth: number): JSX.Element[] {
    return entries.flatMap((entry) => {
      const isDirectory = entry.isDirectory
      const entryPath = toDirectoryKey(entry.relativePath)
      const isExpanded = isDirectory && expandedDirectories.has(entryPath)
      const isLoading = isDirectory && loadingDirectories.has(entryPath)
      const isActiveFile = !isDirectory && activeFilePath === entry.relativePath
      const nestedEntries = isDirectory ? directoryEntriesByPath[entryPath] ?? [] : []
      const fileIconConfig = !isDirectory ? resolveFileIconConfig({ fileName: entry.relativePath }) : null
      const FileIcon = fileIconConfig?.icon
      const row = (
        <li key={entry.relativePath} className="min-w-0">
          <button
            type="button"
            onClick={() => (isDirectory ? toggleDirectory(entry) : onOpenFile(entry.relativePath))}
            className={[
              'flex h-8 w-full min-w-0 items-center gap-1 rounded-none px-2 text-left text-sm transition-colors',
              isActiveFile ? 'bg-surface-muted text-foreground' : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
            ].join(' ')}
            style={{ paddingLeft: `${Math.max(8, depth * 12 + 8)}px` }}
          >
            {isDirectory ? (
              <ChevronRight size={14} className={['shrink-0 transition-transform', isExpanded ? 'rotate-90' : ''].join(' ')} />
            ) : (
              <span className="w-[14px] shrink-0" />
            )}
            {isDirectory ? (
              isExpanded ? (
                <FolderOpen size={14} className="shrink-0 text-subtle-foreground" />
              ) : (
                <Folder size={14} className="shrink-0 text-subtle-foreground" />
              )
            ) : (
              FileIcon ? <FileIcon size={14} className="shrink-0" style={{ color: fileIconConfig?.color }} /> : null
            )}
            <span className="truncate">{entry.name}</span>
            {isLoading ? <RefreshCw size={12} className="ml-auto shrink-0 animate-spin text-subtle-foreground" /> : null}
          </button>
        </li>
      )

      if (!isDirectory || !isExpanded) {
        return [row]
      }

      return [
        row,
        ...renderEntries(nestedEntries, depth + 1),
      ]
    })
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isOpen) {
      return
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startWidth: renderedWidth,
      startX: event.clientX,
    }
    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <aside
      className={[
        'relative hidden h-full shrink-0 min-w-0 flex-col overflow-hidden border-l border-border bg-background md:flex',
        isResizing ? '' : 'transition-[width,opacity] duration-300 ease-out',
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      style={{ width: `${isOpen ? renderedWidth : 0}px` }}
      aria-hidden={!isOpen}
    >
      <div className="flex h-11 items-center justify-between pl-5 pr-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle-foreground">Explorer</p>
        <button
          type="button"
          onClick={() => void loadDirectory(ROOT_DIRECTORY_KEY)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label="Refresh explorer"
          disabled={!isWorkspaceConfigured}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {!isWorkspaceConfigured ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-subtle-foreground">
            Select a workspace folder to use Explorer.
          </p>
        ) : errorMessage ? (
          <div className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            {errorMessage}
          </div>
        ) : rootEntries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-subtle-foreground">
            No files found in this workspace.
          </p>
        ) : (
          <ul>{renderEntries(rootEntries, 0)}</ul>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer panel"
        onPointerDown={handleResizePointerDown}
        className={['absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize', isOpen ? '' : 'pointer-events-none'].join(' ')}
      />
    </aside>
  )
}
