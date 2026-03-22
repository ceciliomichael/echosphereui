import { ChevronRight, File, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { getPathBasename, getPathDirname } from '../../lib/pathPresentation'
import { clampWorkspaceExplorerWidth } from '../../lib/workspaceExplorerSizing'
import type { WorkspaceExplorerEntry } from '../../types/chat'

interface WorkspaceExplorerPanelProps {
  activeFilePath: string | null
  clipboardEntry: {
    mode: 'copy' | 'cut'
    relativePath: string
  } | null
  isOpen: boolean
  onCopyEntry: (relativePath: string) => Promise<void>
  onCreateEntry: (relativePath: string, isDirectory: boolean) => Promise<void>
  onCutEntry: (relativePath: string) => Promise<void>
  onDeleteEntry: (relativePath: string) => Promise<void>
  onMoveEntry: (relativePath: string, targetDirectoryRelativePath: string) => Promise<void>
  onOpenFile: (relativePath: string) => void
  onPasteEntry: (targetDirectoryRelativePath: string) => Promise<void>
  onRenameEntry: (relativePath: string, nextRelativePath: string) => Promise<void>
  onWidthChange: (nextWidth: number) => void
  onWidthCommit: (nextWidth: number) => void
  width: number
  workspaceRootPath: string | null
}

const ROOT_DIRECTORY_KEY = '.'

interface PendingExplorerCreation {
  isDirectory: boolean
  parentPath: string
}

function toDirectoryKey(relativePath: string | undefined) {
  const normalized = (relativePath ?? ROOT_DIRECTORY_KEY).trim()
  return normalized.length === 0 ? ROOT_DIRECTORY_KEY : normalized
}

export function WorkspaceExplorerPanel({
  activeFilePath,
  clipboardEntry,
  isOpen,
  onCopyEntry,
  onCreateEntry,
  onCutEntry,
  onDeleteEntry,
  onMoveEntry,
  onOpenFile,
  onPasteEntry,
  onRenameEntry,
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
  const [creationDraft, setCreationDraft] = useState<PendingExplorerCreation | null>(null)
  const [creationName, setCreationName] = useState('')
  const [dropTargetDirectoryPath, setDropTargetDirectoryPath] = useState<string | null>(null)
  const [contextMenuState, setContextMenuState] = useState<{
    position: { x: number; y: number }
    targetEntry: WorkspaceExplorerEntry | null
  } | null>(null)
  const dragStateRef = useRef<{ pointerId: number; startWidth: number; startX: number } | null>(null)
  const draggedEntryRef = useRef<WorkspaceExplorerEntry | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const creationInputRef = useRef<HTMLInputElement | null>(null)
  const isSubmittingCreationRef = useRef(false)
  const isWorkspaceConfigured = typeof workspaceRootPath === 'string' && workspaceRootPath.trim().length > 0

  function normalizeEntryPath(relativePath: string) {
    return relativePath.replace(/\\/g, '/')
  }

  function isPathWithinTarget(relativePath: string, targetPath: string) {
    const normalizedRelativePath = normalizeEntryPath(relativePath)
    const normalizedTargetPath = normalizeEntryPath(targetPath)
    return (
      normalizedRelativePath === normalizedTargetPath || normalizedRelativePath.startsWith(`${normalizedTargetPath}/`)
    )
  }

  function joinRelativePath(parentPath: string, childName: string) {
    const normalizedParentPath = normalizeEntryPath(parentPath).replace(/^\.\/+/u, '').replace(/\/+$/u, '')
    const normalizedChildName = normalizeEntryPath(childName).replace(/^\/+/u, '').replace(/\/+$/u, '')
    if (normalizedParentPath === '' || normalizedParentPath === ROOT_DIRECTORY_KEY) {
      return normalizedChildName
    }
    return `${normalizedParentPath}/${normalizedChildName}`
  }

  const contextMenuStyle: CSSProperties = useMemo(() => {
    if (!contextMenuState) {
      return {
        left: 0,
        top: 0,
        visibility: 'hidden',
      }
    }

    const menuWidth = 210
    const menuHeight = 280
    const viewportPadding = 8
    const left = Math.min(contextMenuState.position.x, window.innerWidth - menuWidth - viewportPadding)
    const top = Math.min(contextMenuState.position.y, window.innerHeight - menuHeight - viewportPadding)

    return {
      left: Math.max(left, viewportPadding),
      top: Math.max(top, viewportPadding),
      visibility: 'visible',
    }
  }, [contextMenuState])

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

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null)
  }, [])

  const reloadExplorerTree = useCallback(() => {
    const directoriesToReload = [ROOT_DIRECTORY_KEY, ...expandedDirectories]
    void Promise.all(directoriesToReload.map((directoryPath) => loadDirectory(directoryPath)))
  }, [expandedDirectories, loadDirectory])

  const runContextAction = useCallback(
    async (action: () => Promise<void>, shouldReload = true) => {
      closeContextMenu()
      try {
        await action()
        setErrorMessage(null)
        if (shouldReload) {
          reloadExplorerTree()
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Explorer action failed.')
      }
    },
    [closeContextMenu, reloadExplorerTree],
  )

  useEffect(() => {
    setDirectoryEntriesByPath({})
    setExpandedDirectories(new Set())
    setLoadingDirectories(new Set())
    setCreationDraft(null)
    setCreationName('')
    setErrorMessage(null)
    closeContextMenu()
  }, [closeContextMenu, workspaceRootPath])

  useEffect(() => {
    if (!creationDraft) {
      return
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      creationInputRef.current?.focus()
      creationInputRef.current?.select()
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [creationDraft])

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

  useEffect(() => {
    if (!contextMenuState) {
      return
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (contextMenuRef.current?.contains(target)) {
        return
      }
      closeContextMenu()
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [closeContextMenu, contextMenuState])

  const rootEntries = useMemo(() => directoryEntriesByPath[ROOT_DIRECTORY_KEY] ?? [], [directoryEntriesByPath])

  function openContextMenu(event: ReactMouseEvent, targetEntry: WorkspaceExplorerEntry | null) {
    if (!isWorkspaceConfigured) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setContextMenuState({
      position: {
        x: event.clientX,
        y: event.clientY,
      },
      targetEntry,
    })
  }

  function startCreateEntry(isDirectory: boolean) {
    const targetEntry = contextMenuState?.targetEntry ?? null
    const parentPath = targetEntry
      ? targetEntry.isDirectory
        ? targetEntry.relativePath
        : getPathDirname(targetEntry.relativePath)
      : ROOT_DIRECTORY_KEY

    closeContextMenu()
    setErrorMessage(null)
    setCreationDraft({
      isDirectory,
      parentPath,
    })
    setCreationName('')

    if (parentPath !== ROOT_DIRECTORY_KEY) {
      setExpandedDirectories((current) => new Set(current).add(parentPath))
      if (!directoryEntriesByPath[parentPath]) {
        void loadDirectory(parentPath)
      }
    }
  }

  function cancelCreateEntry() {
    isSubmittingCreationRef.current = false
    setCreationDraft(null)
    setCreationName('')
  }

  async function submitCreateEntry() {
    const draft = creationDraft
    if (!draft) {
      return
    }

    const nextName = creationName.trim()
    if (nextName.length === 0) {
      setErrorMessage('Name is required.')
      return
    }
    if (/[/\\]/u.test(nextName)) {
      setErrorMessage('Name cannot include path separators.')
      return
    }

    const nextRelativePath = joinRelativePath(draft.parentPath, nextName)
    isSubmittingCreationRef.current = true
    try {
      await onCreateEntry(nextRelativePath, draft.isDirectory)
      setErrorMessage(null)
      await loadDirectory(draft.parentPath)
      setCreationDraft(null)
      setCreationName('')
      if (!draft.isDirectory) {
        onOpenFile(nextRelativePath)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create workspace entry.')
    } finally {
      isSubmittingCreationRef.current = false
    }
  }

  async function submitPasteEntry(targetDirectoryRelativePath: string) {
    closeContextMenu()
    try {
      await onPasteEntry(targetDirectoryRelativePath)
      setErrorMessage(null)
      const loadOperations = [loadDirectory(ROOT_DIRECTORY_KEY), loadDirectory(targetDirectoryRelativePath)]
      if (clipboardEntry?.mode === 'cut') {
        loadOperations.push(loadDirectory(getPathDirname(clipboardEntry.relativePath)))
      }
      await Promise.all(loadOperations)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to paste workspace entry.')
    }
  }

  async function submitMoveEntry(relativePath: string, targetDirectoryRelativePath: string) {
    setDropTargetDirectoryPath(null)
    try {
      await onMoveEntry(relativePath, targetDirectoryRelativePath)
      setErrorMessage(null)
      const sourceParentPath = getPathDirname(relativePath)
      await Promise.all([
        loadDirectory(ROOT_DIRECTORY_KEY),
        loadDirectory(sourceParentPath),
        loadDirectory(targetDirectoryRelativePath),
      ])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to move workspace entry.')
    }
  }

  function handleEntryDragStart(event: ReactDragEvent<HTMLButtonElement>, entry: WorkspaceExplorerEntry) {
    draggedEntryRef.current = entry
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', entry.relativePath)
  }

  function handleEntryDragEnd() {
    draggedEntryRef.current = null
    setDropTargetDirectoryPath(null)
  }

  function handleDirectoryDragOver(event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) {
    if (!draggedEntryRef.current) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
      setDropTargetDirectoryPath(targetDirectoryRelativePath)
    }
  }

  function handleDirectoryDrop(event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) {
    const draggedEntry = draggedEntryRef.current
    if (!draggedEntry) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    draggedEntryRef.current = null
    void submitMoveEntry(draggedEntry.relativePath, targetDirectoryRelativePath)
  }

  function handleDirectoryDragLeave(event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) {
    if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
      return
    }
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }
    setDropTargetDirectoryPath(null)
  }

  function requestRenameEntry() {
    const targetEntry = contextMenuState?.targetEntry
    if (!targetEntry) {
      closeContextMenu()
      return
    }

    const enteredName = window.prompt('Rename entry', getPathBasename(targetEntry.relativePath))
    if (enteredName === null) {
      closeContextMenu()
      return
    }
    const nextName = enteredName.trim()
    if (nextName.length === 0) {
      setErrorMessage('Name is required.')
      return
    }
    if (/[/\\]/u.test(nextName)) {
      setErrorMessage('Name cannot include path separators.')
      return
    }

    const parentPath = getPathDirname(targetEntry.relativePath)
    const nextRelativePath = joinRelativePath(parentPath, nextName)
    if (normalizeEntryPath(nextRelativePath) === normalizeEntryPath(targetEntry.relativePath)) {
      closeContextMenu()
      return
    }

    void runContextAction(async () => {
      await onRenameEntry(targetEntry.relativePath, nextRelativePath)
    })
  }

  function requestDeleteEntry() {
    const targetEntry = contextMenuState?.targetEntry
    if (!targetEntry) {
      closeContextMenu()
      return
    }
    const confirmed = window.confirm(`Delete ${targetEntry.isDirectory ? 'folder' : 'file'} "${targetEntry.name}"?`)
    if (!confirmed) {
      closeContextMenu()
      return
    }
    void runContextAction(async () => {
      await onDeleteEntry(targetEntry.relativePath)
    })
  }

  function requestCopyOrCutEntry(mode: 'copy' | 'cut') {
    const targetEntry = contextMenuState?.targetEntry
    if (!targetEntry) {
      closeContextMenu()
      return
    }
    void runContextAction(async () => {
      if (mode === 'copy') {
        await onCopyEntry(targetEntry.relativePath)
        return
      }
      await onCutEntry(targetEntry.relativePath)
    }, false)
  }

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

  function renderCreationRow(depth: number) {
    const draft = creationDraft
    if (!draft) {
      return null
    }

    return (
      <li key={`create-${draft.parentPath}-${draft.isDirectory ? 'folder' : 'file'}`} className="min-w-0">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitCreateEntry()
          }}
          className="flex h-8 w-full min-w-0 items-center gap-1 bg-surface-muted px-2 text-left text-sm text-foreground"
          style={{ paddingLeft: `${Math.max(8, depth * 12 + 8)}px` }}
        >
          <span className="w-[14px] shrink-0" />
          {draft.isDirectory ? (
            <Folder size={14} className="shrink-0 text-subtle-foreground" />
          ) : (
            <File size={14} className="shrink-0 text-subtle-foreground" />
          )}
          <input
            ref={creationInputRef}
            value={creationName}
            onChange={(event) => setCreationName(event.target.value)}
            onBlur={() => {
              if (isSubmittingCreationRef.current) {
                return
              }
              cancelCreateEntry()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelCreateEntry()
              }
            }}
            placeholder={draft.isDirectory ? 'folder-name' : 'file-name'}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
          />
        </form>
      </li>
    )
  }

  function renderEntries(entries: readonly WorkspaceExplorerEntry[], depth: number): JSX.Element[] {
    return entries.flatMap((entry) => {
      const isDirectory = entry.isDirectory
      const entryPath = toDirectoryKey(entry.relativePath)
      const isExpanded = isDirectory && expandedDirectories.has(entryPath)
      const isLoading = isDirectory && loadingDirectories.has(entryPath)
      const isActiveFile = !isDirectory && activeFilePath === entry.relativePath
      const isContextTarget = contextMenuState?.targetEntry?.relativePath === entry.relativePath
      const isDropTarget = isDirectory && dropTargetDirectoryPath === entry.relativePath
      const isCutEntry =
        clipboardEntry?.mode === 'cut' && isPathWithinTarget(entry.relativePath, clipboardEntry.relativePath)
      const nestedEntries = isDirectory ? directoryEntriesByPath[entryPath] ?? [] : []
      const fileIconConfig = !isDirectory ? resolveFileIconConfig({ fileName: entry.relativePath }) : null
      const FileIcon = fileIconConfig?.icon
      const row = (
        <li key={entry.relativePath} className="min-w-0">
          <button
            type="button"
            draggable
            onClick={() => (isDirectory ? toggleDirectory(entry) : onOpenFile(entry.relativePath))}
            onContextMenu={(event) => openContextMenu(event, entry)}
            onDragStart={(event) => handleEntryDragStart(event, entry)}
            onDragEnd={handleEntryDragEnd}
            onDragOver={isDirectory ? (event) => handleDirectoryDragOver(event, entry.relativePath) : undefined}
            onDragLeave={isDirectory ? (event) => handleDirectoryDragLeave(event, entry.relativePath) : undefined}
            onDrop={isDirectory ? (event) => handleDirectoryDrop(event, entry.relativePath) : undefined}
            className={[
              'flex h-8 w-full min-w-0 items-center gap-1 rounded-none px-2 text-left text-sm transition-colors',
              isCutEntry ? 'opacity-55' : '',
              isDropTarget ? 'bg-surface-muted text-foreground' : '',
              isActiveFile || isContextTarget
                ? 'bg-surface-muted text-foreground'
                : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
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

      const creationRow =
        creationDraft && normalizeEntryPath(creationDraft.parentPath) === normalizeEntryPath(entry.relativePath)
          ? renderCreationRow(depth + 1)
          : null

      return [
        row,
        ...renderEntries(nestedEntries, depth + 1),
        ...(creationRow ? [creationRow] : []),
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
          onClick={reloadExplorerTree}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          aria-label="Refresh explorer"
          disabled={!isWorkspaceConfigured}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto py-2',
          dropTargetDirectoryPath === ROOT_DIRECTORY_KEY ? 'bg-surface/60' : '',
        ].join(' ')}
        onContextMenu={(event) => openContextMenu(event, null)}
        onDragOver={(event) => {
          if (event.target !== event.currentTarget || !draggedEntryRef.current) {
            return
          }
          handleDirectoryDragOver(event, ROOT_DIRECTORY_KEY)
        }}
        onDragLeave={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          handleDirectoryDragLeave(event, ROOT_DIRECTORY_KEY)
        }}
        onDrop={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          handleDirectoryDrop(event, ROOT_DIRECTORY_KEY)
        }}
      >
        {!isWorkspaceConfigured ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-subtle-foreground">
            Select a workspace folder to use Explorer.
          </p>
        ) : errorMessage ? (
          <div className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            {errorMessage}
          </div>
        ) : rootEntries.length === 0 && !creationDraft ? (
          <button
            type="button"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-subtle-foreground"
          >
            No files found in this workspace.
          </button>
        ) : (
          <ul
            onDragOver={(event) => {
              if (event.target !== event.currentTarget || !draggedEntryRef.current) {
                return
              }
              handleDirectoryDragOver(event, ROOT_DIRECTORY_KEY)
            }}
            onDragLeave={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }
              handleDirectoryDragLeave(event, ROOT_DIRECTORY_KEY)
            }}
            onDrop={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }
              handleDirectoryDrop(event, ROOT_DIRECTORY_KEY)
            }}
          >
            {renderEntries(rootEntries, 0)}
            {creationDraft && normalizeEntryPath(creationDraft.parentPath) === ROOT_DIRECTORY_KEY ? renderCreationRow(0) : null}
          </ul>
        )}
      </div>
      {contextMenuState
        ? createPortal(
            <div
              ref={contextMenuRef}
              role="menu"
              aria-label="Explorer actions"
              data-floating-menu-root="true"
              className="fixed z-[1200] min-w-[210px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-soft"
              style={contextMenuStyle}
            >
              {!contextMenuState.targetEntry || contextMenuState.targetEntry.isDirectory ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => startCreateEntry(false)}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    New File
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => startCreateEntry(true)}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    New Folder
                  </button>
                  {clipboardEntry ? (
                    <>
                      <div className="my-1 h-px bg-border" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          void submitPasteEntry(
                            contextMenuState.targetEntry?.isDirectory
                              ? contextMenuState.targetEntry.relativePath
                              : ROOT_DIRECTORY_KEY,
                          )
                        }
                        className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                      >
                        Paste
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              {contextMenuState.targetEntry?.isDirectory ? (
                <>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={requestDeleteEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-danger-foreground transition-colors hover:bg-danger-surface"
                  >
                    Delete Folder
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={requestRenameEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Rename
                  </button>
                </>
              ) : null}
              {contextMenuState.targetEntry && !contextMenuState.targetEntry.isDirectory ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={requestDeleteEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-danger-foreground transition-colors hover:bg-danger-surface"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={requestRenameEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => requestCopyOrCutEntry('cut')}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Cut
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => requestCopyOrCutEntry('copy')}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Copy
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
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
