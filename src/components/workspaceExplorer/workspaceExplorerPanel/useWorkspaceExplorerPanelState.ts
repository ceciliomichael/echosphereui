import {
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { WorkspaceExplorerEntry } from '../../../types/chat'
import { clampWorkspaceExplorerWidth } from '../../../lib/workspaceExplorerSizing'
import { getPathBasename, getPathDirname } from '../../../lib/pathPresentation'
import type { WorkspaceExplorerPanelProps } from './workspaceExplorerPanelTypes'
import type { WorkspaceExplorerContextMenuDimensions } from './workspaceExplorerPanelTypes'
import type { WorkspaceExplorerDeleteDialogState } from './workspaceExplorerPanelTypes'
import {
  ROOT_DIRECTORY_KEY,
  getAncestorDirectoryPaths,
  getWorkspaceExplorerContextMenuStyle,
  joinRelativePath,
  normalizeEntryPath,
  toDirectoryKey,
} from './workspaceExplorerPanelUtils'
import type { PendingExplorerCreation, WorkspaceExplorerContextMenuState } from './workspaceExplorerPanelTypes'

interface ExternalFileDropItem {
  path: string
}

const ACTIVE_EXPLORER_SYNC_INTERVAL_MS = 1000
const DRAG_SCROLL_EDGE_THRESHOLD_PX = 72
const DRAG_SCROLL_MAX_SPEED_PX = 22
const MIN_SCROLLBAR_GUTTER_WIDTH_PX = 12

function getExternalFilePaths(event: ReactDragEvent<HTMLElement>) {
  const items = Array.from(event.dataTransfer.items)
  const filePaths: string[] = []

  for (const item of items) {
    if (item.kind !== 'file') {
      continue
    }

    const file = item.getAsFile() as ExternalFileDropItem | null
    if (!file || typeof file.path !== 'string' || file.path.trim().length === 0) {
      continue
    }

    filePaths.push(file.path)
  }

  return filePaths
}

function getSelectionDirectoryPath(entry: WorkspaceExplorerEntry) {
  return toDirectoryKey(getPathDirname(entry.relativePath))
}

function getDragScrollVelocity(containerElement: HTMLElement, clientY: number) {
  const { bottom, top } = containerElement.getBoundingClientRect()
  const distanceFromTop = clientY - top
  const distanceFromBottom = bottom - clientY

  if (distanceFromTop < DRAG_SCROLL_EDGE_THRESHOLD_PX) {
    const intensity = 1 - Math.max(distanceFromTop, 0) / DRAG_SCROLL_EDGE_THRESHOLD_PX
    return -Math.ceil(intensity * DRAG_SCROLL_MAX_SPEED_PX)
  }

  if (distanceFromBottom < DRAG_SCROLL_EDGE_THRESHOLD_PX) {
    const intensity = 1 - Math.max(distanceFromBottom, 0) / DRAG_SCROLL_EDGE_THRESHOLD_PX
    return Math.ceil(intensity * DRAG_SCROLL_MAX_SPEED_PX)
  }

  return 0
}

function isPointerInVerticalScrollbarGutter(containerElement: HTMLElement, clientX: number) {
  if (containerElement.scrollHeight <= containerElement.clientHeight) {
    return false
  }

  const { left, right } = containerElement.getBoundingClientRect()
  const scrollbarWidth = Math.max(MIN_SCROLLBAR_GUTTER_WIDTH_PX, containerElement.offsetWidth - containerElement.clientWidth)
  const isRtl = window.getComputedStyle(containerElement).direction === 'rtl'

  return isRtl
    ? clientX >= left && clientX <= left + scrollbarWidth
    : clientX <= right && clientX >= right - scrollbarWidth
}

function scrollToDragScrollbarPosition(containerElement: HTMLElement, clientY: number) {
  const { height, top } = containerElement.getBoundingClientRect()
  const maxScrollTop = containerElement.scrollHeight - containerElement.clientHeight
  if (height <= 0 || maxScrollTop <= 0) {
    return
  }

  const scrollRatio = Math.min(Math.max((clientY - top) / height, 0), 1)
  containerElement.scrollTop = Math.round(maxScrollTop * scrollRatio)
}

function getDirectoryEntriesForSelection(
  directoryEntriesByPath: Record<string, WorkspaceExplorerEntry[]>,
  rootEntries: WorkspaceExplorerEntry[],
  directoryPath: string,
) {
  return directoryPath === ROOT_DIRECTORY_KEY ? rootEntries : directoryEntriesByPath[directoryPath] ?? []
}

function collectLoadedExplorerEntryPaths(
  entries: readonly WorkspaceExplorerEntry[],
  directoryEntriesByPath: Record<string, WorkspaceExplorerEntry[]>,
) {
  const relativePaths: string[] = []

  for (const entry of entries) {
    relativePaths.push(entry.relativePath)
    if (!entry.isDirectory) {
      continue
    }

    relativePaths.push(
      ...collectLoadedExplorerEntryPaths(
        directoryEntriesByPath[normalizeEntryPath(entry.relativePath)] ?? [],
        directoryEntriesByPath,
      ),
    )
  }

  return relativePaths
}

function findLoadedExplorerEntry(
  entries: readonly WorkspaceExplorerEntry[],
  directoryEntriesByPath: Record<string, WorkspaceExplorerEntry[]>,
  relativePath: string,
): WorkspaceExplorerEntry | null {
  for (const entry of entries) {
    if (entry.relativePath === relativePath) {
      return entry
    }

    if (!entry.isDirectory) {
      continue
    }

    const nestedEntry = findLoadedExplorerEntry(
      directoryEntriesByPath[normalizeEntryPath(entry.relativePath)] ?? [],
      directoryEntriesByPath,
      relativePath,
    )
    if (nestedEntry) {
      return nestedEntry
    }
  }

  return null
}

function isTreeShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return !target.matches('input, textarea, [contenteditable="true"]')
}

export function useWorkspaceExplorerPanelState({
  activeFilePath,
  clipboardEntry,
  isOpen,
  onCopyEntry,
  onCreateEntry,
  onCutEntry,
  onDeleteEntry,
  onImportEntry,
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
  const [contextMenuState, setContextMenuState] = useState<WorkspaceExplorerContextMenuState | null>(null)
  const [contextMenuDimensions, setContextMenuDimensions] = useState<WorkspaceExplorerContextMenuDimensions | null>(null)
  const [deleteDialogState, setDeleteDialogState] = useState<WorkspaceExplorerDeleteDialogState | null>(null)
  const [isSubmittingDeleteEntry, setIsSubmittingDeleteEntry] = useState(false)
  const [selectedEntryPaths, setSelectedEntryPaths] = useState<Set<string>>(() => new Set())
  const [selectionDirectoryPath, setSelectionDirectoryPath] = useState<string>(ROOT_DIRECTORY_KEY)
  const [isDraggingExplorerEntry, setIsDraggingExplorerEntry] = useState(false)
  const dragStateRef = useRef<{ pointerId: number; startWidth: number; startX: number } | null>(null)
  const onWidthChangeRef = useRef(onWidthChange)
  const onWidthCommitRef = useRef(onWidthCommit)
  const draggedEntryRef = useRef<WorkspaceExplorerEntry | null>(null)
  const dragScrollAnimationFrameRef = useRef<number | null>(null)
  const dragScrollVelocityRef = useRef(0)
  const selectionAnchorEntryPathRef = useRef<string | null>(null)
  const isActiveSyncReloadingRef = useRef(false)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const creationInputRef = useRef<HTMLInputElement | null>(null)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const isSubmittingCreationRef = useRef(false)
  const isWorkspaceConfigured = typeof workspaceRootPath === 'string' && workspaceRootPath.trim().length > 0

  const stopDragScroll = useCallback(() => {
    dragScrollVelocityRef.current = 0
    if (dragScrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollAnimationFrameRef.current)
      dragScrollAnimationFrameRef.current = null
    }
  }, [])

  const runDragScrollFrame = useCallback(() => {
    const containerElement = treeContainerRef.current
    const velocity = dragScrollVelocityRef.current

    if (!containerElement || velocity === 0) {
      dragScrollAnimationFrameRef.current = null
      return
    }

    containerElement.scrollTop += velocity
    dragScrollAnimationFrameRef.current = window.requestAnimationFrame(runDragScrollFrame)
  }, [])

  const updateDragScroll = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const containerElement = treeContainerRef.current
    if (!containerElement) {
      stopDragScroll()
      return
    }

    dragScrollVelocityRef.current = getDragScrollVelocity(containerElement, event.clientY)
    if (dragScrollVelocityRef.current === 0) {
      stopDragScroll()
      return
    }

    if (dragScrollAnimationFrameRef.current === null) {
      dragScrollAnimationFrameRef.current = window.requestAnimationFrame(runDragScrollFrame)
    }
  }, [runDragScrollFrame, stopDragScroll])

  const handleExplorerDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!draggedEntryRef.current && !Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }

    const containerElement = treeContainerRef.current
    if (containerElement && isPointerInVerticalScrollbarGutter(containerElement, event.clientX)) {
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'none'
      stopDragScroll()
      scrollToDragScrollbarPosition(containerElement, event.clientY)
      return
    }

    updateDragScroll(event)
  }, [stopDragScroll, updateDragScroll])

  const handleExplorerDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    stopDragScroll()
  }, [stopDragScroll])

  const handleExplorerScrollbarDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!draggedEntryRef.current) {
      return
    }

    const containerElement = treeContainerRef.current
    if (!containerElement) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'none'
    stopDragScroll()
    scrollToDragScrollbarPosition(containerElement, event.clientY)
  }, [stopDragScroll])

  useEffect(() => {
    return () => {
      stopDragScroll()
    }
  }, [stopDragScroll])

  useEffect(() => {
    onWidthChangeRef.current = onWidthChange
    onWidthCommitRef.current = onWidthCommit
  }, [onWidthChange, onWidthCommit])

  const contextMenuStyle = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        left: 0,
        top: 0,
        visibility: 'hidden',
      } satisfies CSSProperties
    }

    return getWorkspaceExplorerContextMenuStyle(contextMenuState, {
      height: window.innerHeight,
      width: window.innerWidth,
    }, contextMenuDimensions)
  }, [contextMenuDimensions, contextMenuState])

  useLayoutEffect(() => {
    if (!contextMenuState) {
      setContextMenuDimensions(null)
      return
    }

    const contextMenuElement = contextMenuRef.current
    if (!contextMenuElement) {
      return
    }

    const updateContextMenuDimensions = () => {
      const nextRect = contextMenuElement.getBoundingClientRect()
      setContextMenuDimensions((currentDimensions) => {
        if (
          currentDimensions?.width === nextRect.width &&
          currentDimensions?.height === nextRect.height
        ) {
          return currentDimensions
        }

        return {
          height: nextRect.height,
          width: nextRect.width,
        }
      })
    }

    updateContextMenuDimensions()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const resizeObserver = new ResizeObserver(updateContextMenuDimensions)
    resizeObserver.observe(contextMenuElement)

    return () => {
      resizeObserver.disconnect()
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
          visibility: 'explorer',
          workspaceRootPath,
        })
        setDirectoryEntriesByPath((current) => ({
          ...current,
          [targetPath]: entries,
        }))
        setErrorMessage(null)
      } catch (error) {
        const errorText = error instanceof Error ? error.message : 'Failed to load workspace files.'
        if (targetPath !== ROOT_DIRECTORY_KEY && errorText.startsWith('Directory does not exist:')) {
          setDirectoryEntriesByPath((current) => {
            const nextState = { ...current }
            delete nextState[targetPath]
            return nextState
          })
          setExpandedDirectories((current) => {
            const nextState = new Set(current)
            nextState.delete(targetPath)
            return nextState
          })
          return
        }
        setErrorMessage(errorText)
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

  const preserveTreeScrollDuring = useCallback(async (operation: () => Promise<void>) => {
    const treeContainer = treeContainerRef.current
    const previousScrollTop = treeContainer?.scrollTop ?? 0

    await operation()

    window.requestAnimationFrame(() => {
      const currentTreeContainer = treeContainerRef.current
      if (!currentTreeContainer) {
        return
      }

      currentTreeContainer.scrollTop = Math.min(
        previousScrollTop,
        Math.max(0, currentTreeContainer.scrollHeight - currentTreeContainer.clientHeight),
      )
    })
  }, [])

  const reloadExplorerTree = useCallback(() => {
    const directoriesToReload = [ROOT_DIRECTORY_KEY, ...expandedDirectories]
    return preserveTreeScrollDuring(async () => {
      await Promise.all(directoriesToReload.map((directoryPath) => loadDirectory(directoryPath)))
    })
  }, [expandedDirectories, loadDirectory, preserveTreeScrollDuring])
  const reloadExplorerTreeRef = useRef(reloadExplorerTree)

  useEffect(() => {
    reloadExplorerTreeRef.current = reloadExplorerTree
  }, [reloadExplorerTree])

  const runContextAction = useCallback(
    async (action: () => Promise<void>, shouldReload = true) => {
      closeContextMenu()
      try {
        await action()
        setErrorMessage(null)
        if (shouldReload) {
          await reloadExplorerTree()
        }
        return true
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Explorer action failed.')
        return false
      }
    },
    [closeContextMenu, reloadExplorerTree],
  )

  const closeDeleteDialog = useCallback(() => {
    if (isSubmittingDeleteEntry) {
      return
    }

    setDeleteDialogState(null)
  }, [isSubmittingDeleteEntry])

  const openDeleteDialog = useCallback(
    (targetRelativePaths: readonly string[], targetEntry: WorkspaceExplorerEntry | null) => {
      const normalizedRelativePaths = Array.from(
        new Set(targetRelativePaths.map((relativePath) => relativePath.trim()).filter((relativePath) => relativePath.length > 0)),
      )

      if (normalizedRelativePaths.length === 0) {
        closeContextMenu()
        return
      }

      const primaryEntry =
        targetEntry ??
        findLoadedExplorerEntry(directoryEntriesByPath[ROOT_DIRECTORY_KEY] ?? [], directoryEntriesByPath, normalizedRelativePaths[0]) ??
        null

      setDeleteDialogState({
        primaryEntryKind: primaryEntry?.isDirectory ? 'folder' : 'file',
        primaryEntryName: primaryEntry?.name ?? getPathBasename(normalizedRelativePaths[0]),
        targetRelativePaths: normalizedRelativePaths,
      })
      closeContextMenu()
    },
    [closeContextMenu, directoryEntriesByPath],
  )

  const confirmDeleteEntry = useCallback(async () => {
    if (!deleteDialogState) {
      return
    }

    setIsSubmittingDeleteEntry(true)
    try {
      const didDelete = await runContextAction(async () => {
        await onDeleteEntry(deleteDialogState.targetRelativePaths)
      })

      if (didDelete) {
        setDeleteDialogState(null)
      }
    } finally {
      setIsSubmittingDeleteEntry(false)
    }
  }, [deleteDialogState, onDeleteEntry, runContextAction])

  const rootEntries = useMemo(() => directoryEntriesByPath[ROOT_DIRECTORY_KEY] ?? [], [directoryEntriesByPath])

  useEffect(() => {
    setDirectoryEntriesByPath({})
    setExpandedDirectories(new Set())
    setLoadingDirectories(new Set())
    setCreationDraft(null)
    setCreationName('')
    setErrorMessage(null)
    setDeleteDialogState(null)
    setIsSubmittingDeleteEntry(false)
    setSelectedEntryPaths(new Set())
    setSelectionDirectoryPath(ROOT_DIRECTORY_KEY)
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

      const nextWidth = clampWorkspaceExplorerWidth(
        dragState.startWidth - (event.clientX - dragState.startX),
        window.innerWidth,
      )
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
      onWidthChangeRef.current(committedWidth)
      onWidthCommitRef.current(committedWidth)
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
  }, [])

  useEffect(() => {
    if (!isOpen || !workspaceRootPath) {
      return
    }

    let isDisposed = false
    const unsubscribeWorkspaceChanges = window.echosphereWorkspace.onExplorerChange((event) => {
      if (isDisposed || event.workspaceRootPath !== workspaceRootPath) {
        return
      }
      reloadExplorerTreeRef.current()
    })

    void window.echosphereWorkspace.watchExplorerChanges({
      workspaceRootPath,
    }).catch((error) => {
      console.error('Failed to watch workspace explorer changes', error)
    })

    void loadDirectory(ROOT_DIRECTORY_KEY)

    return () => {
      isDisposed = true
      unsubscribeWorkspaceChanges()
      void window.echosphereWorkspace.unwatchExplorerChanges({
        workspaceRootPath,
      }).catch((error) => {
        console.error('Failed to unwatch workspace explorer changes', error)
      })
    }
  }, [isOpen, loadDirectory, workspaceRootPath])

  useEffect(() => {
    if (!isOpen || !workspaceRootPath) {
      return
    }

    const reloadIfIdle = () => {
      if (isActiveSyncReloadingRef.current) {
        return
      }

      isActiveSyncReloadingRef.current = true
      Promise.resolve(reloadExplorerTreeRef.current()).finally(() => {
        isActiveSyncReloadingRef.current = false
      })
    }

    const intervalId = window.setInterval(reloadIfIdle, ACTIVE_EXPLORER_SYNC_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
      isActiveSyncReloadingRef.current = false
    }
  }, [isOpen, workspaceRootPath])

  useEffect(() => {
    if (!isOpen || !workspaceRootPath || !activeFilePath) {
      return
    }

    const ancestorDirectoryPaths = getAncestorDirectoryPaths(activeFilePath)
    if (ancestorDirectoryPaths.length === 0) {
      return
    }

    setExpandedDirectories((current) => {
      let hasChanges = false
      const nextState = new Set(current)
      for (const directoryPath of ancestorDirectoryPaths) {
        if (nextState.has(directoryPath)) {
          continue
        }
        nextState.add(directoryPath)
        hasChanges = true
      }

      return hasChanges ? nextState : current
    })

    const missingDirectoryPaths = ancestorDirectoryPaths.filter((directoryPath) => !directoryEntriesByPath[directoryPath])
    if (missingDirectoryPaths.length > 0) {
      void Promise.all(missingDirectoryPaths.map((directoryPath) => loadDirectory(directoryPath)))
    }
  }, [activeFilePath, directoryEntriesByPath, isOpen, loadDirectory, workspaceRootPath])

  useEffect(() => {
    if (!isOpen || !activeFilePath) {
      return
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const containerElement = treeContainerRef.current
      if (!containerElement) {
        return
      }

      const entryButtons = Array.from(containerElement.querySelectorAll<HTMLButtonElement>('[data-workspace-entry-path]'))
      const activeEntryButton = entryButtons.find(
        (entryButton) => entryButton.dataset.workspaceEntryPath === activeFilePath,
      )
      activeEntryButton?.scrollIntoView({
        block: 'nearest',
      })
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [activeFilePath, directoryEntriesByPath, expandedDirectories, isOpen])

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

  const openContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, targetEntry: WorkspaceExplorerEntry | null) => {
      if (!isWorkspaceConfigured) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      if (targetEntry) {
        const nextSelectionDirectoryPath = getSelectionDirectoryPath(targetEntry)
        if (!selectedEntryPaths.has(targetEntry.relativePath)) {
          setSelectionDirectoryPath(nextSelectionDirectoryPath)
          setSelectedEntryPaths(new Set([targetEntry.relativePath]))
          selectionAnchorEntryPathRef.current = targetEntry.relativePath
        }
      } else {
        setSelectionDirectoryPath(ROOT_DIRECTORY_KEY)
        setSelectedEntryPaths(new Set())
        selectionAnchorEntryPathRef.current = null
      }
      setContextMenuState({
        position: {
          x: event.clientX,
          y: event.clientY,
        },
        targetEntry,
      })
    },
    [isWorkspaceConfigured, selectedEntryPaths],
  )

  const startCreateEntry = useCallback(
    (isDirectory: boolean) => {
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
    },
    [closeContextMenu, contextMenuState, directoryEntriesByPath, loadDirectory],
  )

  const cancelCreateEntry = useCallback(() => {
    isSubmittingCreationRef.current = false
    setCreationDraft(null)
    setCreationName('')
  }, [])

  const onCreationNameChange = useCallback((nextName: string) => {
    setCreationName(nextName)
  }, [])

  const submitCreateEntry = useCallback(async () => {
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
      if (draft.isDirectory) {
        setExpandedDirectories((current) => new Set(current).add(nextRelativePath))
      }
      await Promise.all([
        loadDirectory(draft.parentPath),
        draft.isDirectory ? loadDirectory(nextRelativePath) : Promise.resolve(),
      ])
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
  }, [creationDraft, creationName, loadDirectory, onCreateEntry, onOpenFile])

  const submitPasteEntry = useCallback(
    async (targetDirectoryRelativePath: string) => {
      closeContextMenu()
      try {
        await onPasteEntry(targetDirectoryRelativePath)
        setErrorMessage(null)
        const loadOperations = [loadDirectory(ROOT_DIRECTORY_KEY), loadDirectory(targetDirectoryRelativePath)]
        if (clipboardEntry?.mode === 'cut') {
          const sourceParentPaths = Array.from(
            new Set(clipboardEntry.relativePaths.map((relativePath) => getPathDirname(relativePath))),
          )
          for (const sourceParentPath of sourceParentPaths) {
            loadOperations.push(loadDirectory(sourceParentPath))
          }
        }
        await Promise.all(loadOperations)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to paste workspace entry.')
      }
    },
    [clipboardEntry, closeContextMenu, loadDirectory, onPasteEntry],
  )

  const submitMoveEntry = useCallback(
    async (relativePath: string, targetDirectoryRelativePath: string) => {
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
    },
    [loadDirectory, onMoveEntry],
  )

  const submitImportEntry = useCallback(
    async (sourcePath: string, targetDirectoryRelativePath: string) => {
      if (!workspaceRootPath) {
        throw new Error('Select a workspace folder first.')
      }

      setDropTargetDirectoryPath(null)
      try {
        await onImportEntry(sourcePath, targetDirectoryRelativePath)
        setErrorMessage(null)
        await Promise.all([loadDirectory(ROOT_DIRECTORY_KEY), loadDirectory(targetDirectoryRelativePath)])
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to import workspace entry.')
      }
    },
    [loadDirectory, onImportEntry, workspaceRootPath],
  )

  const handleEntryDragStart = useCallback((event: ReactDragEvent<HTMLButtonElement>, entry: WorkspaceExplorerEntry) => {
    draggedEntryRef.current = entry
    setIsDraggingExplorerEntry(true)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', entry.relativePath)
  }, [])

  const handleEntryDragEnd = useCallback(() => {
    draggedEntryRef.current = null
    setIsDraggingExplorerEntry(false)
    setDropTargetDirectoryPath(null)
    stopDragScroll()
  }, [stopDragScroll])

  const handleDirectoryDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      if (!draggedEntryRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      updateDragScroll(event)
      event.dataTransfer.dropEffect = 'move'
      if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
        setDropTargetDirectoryPath(targetDirectoryRelativePath)
      }
    },
    [dropTargetDirectoryPath, updateDragScroll],
  )

  const handleDirectoryDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      const draggedEntry = draggedEntryRef.current
      if (!draggedEntry) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      stopDragScroll()
      draggedEntryRef.current = null
      setIsDraggingExplorerEntry(false)
      void submitMoveEntry(draggedEntry.relativePath, targetDirectoryRelativePath)
    },
    [stopDragScroll, submitMoveEntry],
  )

  const handleDirectoryDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
        return
      }
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return
      }
      setDropTargetDirectoryPath(null)
    },
    [dropTargetDirectoryPath],
  )

  const handleExternalDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      if (!workspaceRootPath) {
        return
      }

      const hasFiles = Array.from(event.dataTransfer.types).includes('Files')
      if (!hasFiles) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      updateDragScroll(event)
      event.dataTransfer.dropEffect = 'copy'
      if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
        setDropTargetDirectoryPath(targetDirectoryRelativePath)
      }
    },
    [dropTargetDirectoryPath, updateDragScroll, workspaceRootPath],
  )

  const handleExternalDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
        return
      }

      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return
      }

      setDropTargetDirectoryPath(null)
    },
    [dropTargetDirectoryPath],
  )

  const handleExternalDrop = useCallback(
    async (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      if (!workspaceRootPath) {
        return
      }

      const filePaths = getExternalFilePaths(event)

      if (filePaths.length === 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      stopDragScroll()
      setDropTargetDirectoryPath(null)

      try {
        for (const filePath of filePaths) {
          await submitImportEntry(filePath, targetDirectoryRelativePath)
        }
      } finally {
        setDropTargetDirectoryPath(null)
      }
    },
    [stopDragScroll, submitImportEntry, workspaceRootPath],
  )

  const requestRenameEntry = useCallback(() => {
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
  }, [closeContextMenu, contextMenuState, onRenameEntry, runContextAction])

  const requestDeleteEntry = useCallback(() => {
    const targetEntry = contextMenuState?.targetEntry
    if (!targetEntry) {
      closeContextMenu()
      return
    }

    const targetRelativePaths = selectedEntryPaths.has(targetEntry.relativePath)
      ? Array.from(selectedEntryPaths)
      : [targetEntry.relativePath]

    openDeleteDialog(targetRelativePaths, targetEntry)
  }, [closeContextMenu, contextMenuState, openDeleteDialog, selectedEntryPaths])

  const requestCopyOrCutEntries = useCallback(
    (relativePaths: readonly string[], mode: 'copy' | 'cut') => {
      const normalizedRelativePaths = Array.from(
        new Set(relativePaths.map((relativePath) => relativePath.trim()).filter((relativePath) => relativePath.length > 0)),
      )
      if (normalizedRelativePaths.length === 0) {
        closeContextMenu()
        return
      }

      void runContextAction(
        async () => {
          if (mode === 'copy') {
            await onCopyEntry(normalizedRelativePaths)
            return
          }
          await onCutEntry(normalizedRelativePaths)
        },
        false,
      )
    },
    [closeContextMenu, onCopyEntry, onCutEntry, runContextAction],
  )

  const requestCopyOrCutEntry = useCallback(
    (mode: 'copy' | 'cut') => {
      const targetEntry = contextMenuState?.targetEntry
      if (!targetEntry) {
        closeContextMenu()
        return
      }

      requestCopyOrCutEntries(
        selectedEntryPaths.has(targetEntry.relativePath) ? Array.from(selectedEntryPaths) : [targetEntry.relativePath],
        mode,
      )
    },
    [closeContextMenu, contextMenuState, requestCopyOrCutEntries, selectedEntryPaths],
  )

  const selectEntry = useCallback((entry: WorkspaceExplorerEntry) => {
    setSelectionDirectoryPath(getSelectionDirectoryPath(entry))
    setSelectedEntryPaths(new Set([entry.relativePath]))
    selectionAnchorEntryPathRef.current = entry.relativePath
  }, [])

  const clearEntrySelection = useCallback(() => {
    setSelectionDirectoryPath(ROOT_DIRECTORY_KEY)
    setSelectedEntryPaths(new Set())
    selectionAnchorEntryPathRef.current = null
  }, [])

  const toggleEntrySelection = useCallback((entry: WorkspaceExplorerEntry) => {
    const nextSelectionDirectoryPath = getSelectionDirectoryPath(entry)
    setSelectionDirectoryPath(nextSelectionDirectoryPath)
    selectionAnchorEntryPathRef.current = entry.relativePath
    setSelectedEntryPaths((currentPaths) => {
      if (selectionDirectoryPath !== nextSelectionDirectoryPath) {
        return new Set([entry.relativePath])
      }

      const nextPaths = new Set(currentPaths)
      if (nextPaths.has(entry.relativePath)) {
        nextPaths.delete(entry.relativePath)
      } else {
        nextPaths.add(entry.relativePath)
      }
      return nextPaths
    })
  }, [selectionDirectoryPath])

  const selectEntryRange = useCallback((entry: WorkspaceExplorerEntry) => {
    const nextSelectionDirectoryPath = getSelectionDirectoryPath(entry)
    const directoryEntries = getDirectoryEntriesForSelection(
      directoryEntriesByPath,
      rootEntries,
      nextSelectionDirectoryPath,
    )
    const anchorEntryPath = selectionDirectoryPath === nextSelectionDirectoryPath
      ? selectionAnchorEntryPathRef.current
      : null
    const anchorIndex = anchorEntryPath
      ? directoryEntries.findIndex((candidateEntry) => candidateEntry.relativePath === anchorEntryPath)
      : -1
    const targetIndex = directoryEntries.findIndex((candidateEntry) => candidateEntry.relativePath === entry.relativePath)

    if (anchorIndex === -1 || targetIndex === -1) {
      selectEntry(entry)
      return
    }

    const startIndex = Math.min(anchorIndex, targetIndex)
    const endIndex = Math.max(anchorIndex, targetIndex)
    setSelectionDirectoryPath(nextSelectionDirectoryPath)
    setSelectedEntryPaths(new Set(directoryEntries.slice(startIndex, endIndex + 1).map((candidateEntry) => candidateEntry.relativePath)))
  }, [directoryEntriesByPath, rootEntries, selectEntry, selectionDirectoryPath])

  const selectAllLoadedEntriesInSelectionDirectory = useCallback(() => {
    const anchorEntryPath = selectionAnchorEntryPathRef.current
    const selectedDirectoryEntry =
      selectedEntryPaths.size === 1 && anchorEntryPath && selectedEntryPaths.has(anchorEntryPath)
        ? findLoadedExplorerEntry(rootEntries, directoryEntriesByPath, anchorEntryPath)
        : null
    const selectionDirectoryEntries = getDirectoryEntriesForSelection(
      directoryEntriesByPath,
      rootEntries,
      selectionDirectoryPath,
    )
    const loadedEntryPaths =
      selectedDirectoryEntry?.isDirectory === true
        ? collectLoadedExplorerEntryPaths([selectedDirectoryEntry], directoryEntriesByPath)
        : collectLoadedExplorerEntryPaths(selectionDirectoryEntries, directoryEntriesByPath)
    if (loadedEntryPaths.length === 0) {
      return false
    }

    setSelectedEntryPaths(new Set(loadedEntryPaths))
    selectionAnchorEntryPathRef.current = loadedEntryPaths[0] ?? null
    return true
  }, [directoryEntriesByPath, rootEntries, selectedEntryPaths, selectionDirectoryPath])

  const handleTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isTreeShortcutTarget(event.target)) {
        return
      }

      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.key === 'Delete') {
        if (selectedEntryPaths.size === 0) {
          return
        }
        event.preventDefault()
        openDeleteDialog(Array.from(selectedEntryPaths), findLoadedExplorerEntry(rootEntries, directoryEntriesByPath, Array.from(selectedEntryPaths)[0]) ?? null)
        return
      }

      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      const key = event.key.toLowerCase()
      if (event.shiftKey || event.altKey) {
        return
      }

      if (key === 'a') {
        event.preventDefault()
        selectAllLoadedEntriesInSelectionDirectory()
        return
      }

      const selectedRelativePaths =
        selectedEntryPaths.size > 0
          ? Array.from(selectedEntryPaths)
          : activeFilePath
            ? [activeFilePath]
            : []

      if (key === 'c') {
        event.preventDefault()
        requestCopyOrCutEntries(selectedRelativePaths, 'copy')
        return
      }

      if (key === 'x') {
        event.preventDefault()
        requestCopyOrCutEntries(selectedRelativePaths, 'cut')
        return
      }

      if (key === 'v') {
        event.preventDefault()
        void submitPasteEntry(selectionDirectoryPath)
      }
    },
    [
      activeFilePath,
      directoryEntriesByPath,
      openDeleteDialog,
      requestCopyOrCutEntries,
      rootEntries,
      selectAllLoadedEntriesInSelectionDirectory,
      selectedEntryPaths,
      selectionDirectoryPath,
      submitPasteEntry,
    ],
  )

  const toggleDirectory = useCallback(
    (directory: WorkspaceExplorerEntry) => {
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
    },
    [directoryEntriesByPath, loadDirectory],
  )

  const handleEntryClick = useCallback(
    (entry: WorkspaceExplorerEntry, event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey) {
        selectEntryRange(entry)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        toggleEntrySelection(entry)
        return
      }

      selectEntry(entry)
      if (entry.isDirectory) {
        toggleDirectory(entry)
        return
      }

      onOpenFile(entry.relativePath)
    },
    [onOpenFile, selectEntry, selectEntryRange, toggleDirectory, toggleEntrySelection],
  )

  const handleExplorerBackgroundClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return
    }

    clearEntrySelection()
  }, [clearEntrySelection])

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isOpen || event.button !== 0) {
        return
      }

      dragStateRef.current = {
        pointerId: event.pointerId,
        startWidth: renderedWidth,
        startX: event.clientX,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopPropagation()
      setIsResizing(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [isOpen, renderedWidth],
  )

  return {
    cancelCreateEntry,
    contextMenuRef,
    contextMenuState,
    contextMenuStyle,
    creationDraft,
    creationInputRef,
    creationName,
    directoryEntriesByPath,
    dropTargetDirectoryPath,
    errorMessage,
    expandedDirectories,
    closeDeleteDialog,
    handleDirectoryDragLeave,
    handleDirectoryDragOver,
    handleDirectoryDrop,
    handleExternalDragLeave,
    handleExternalDragOver,
    handleExternalDrop,
    handleEntryDragEnd,
    handleEntryDragStart,
    handleEntryClick,
    handleExplorerBackgroundClick,
    handleExplorerDragLeave,
    handleExplorerDragOver,
    handleExplorerScrollbarDragOver,
    handleResizePointerDown,
    isDraggingExplorerEntry,
    isResizing,
    isSubmittingDeleteEntry,
    isSubmittingCreationRef,
    isWorkspaceConfigured,
    loadingDirectories,
    onCreationNameChange,
    deleteDialogState,
    openContextMenu,
    renderedWidth,
    confirmDeleteEntry,
    requestCopyOrCutEntry,
    requestDeleteEntry,
    requestRenameEntry,
    rootEntries,
    selectedEntryPaths,
    startCreateEntry,
    submitCreateEntry,
    submitMoveEntry,
    submitPasteEntry,
    handleTreeKeyDown,
    treeContainerRef,
    toggleDirectory,
  }
}

export type WorkspaceExplorerPanelState = ReturnType<typeof useWorkspaceExplorerPanelState>
