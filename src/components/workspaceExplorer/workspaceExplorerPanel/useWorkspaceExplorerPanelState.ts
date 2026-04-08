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
  return entry.isDirectory ? normalizeEntryPath(entry.relativePath) : toDirectoryKey(getPathDirname(entry.relativePath))
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
  const [selectedEntryPaths, setSelectedEntryPaths] = useState<Set<string>>(() => new Set())
  const [selectionDirectoryPath, setSelectionDirectoryPath] = useState<string>(ROOT_DIRECTORY_KEY)
  const dragStateRef = useRef<{ pointerId: number; startWidth: number; startX: number } | null>(null)
  const draggedEntryRef = useRef<WorkspaceExplorerEntry | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const creationInputRef = useRef<HTMLInputElement | null>(null)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const isSubmittingCreationRef = useRef(false)
  const isWorkspaceConfigured = typeof workspaceRootPath === 'string' && workspaceRootPath.trim().length > 0

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

  const reloadExplorerTree = useCallback(() => {
    const directoriesToReload = [ROOT_DIRECTORY_KEY, ...expandedDirectories]
    void Promise.all(directoriesToReload.map((directoryPath) => loadDirectory(directoryPath)))
  }, [expandedDirectories, loadDirectory])
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
          reloadExplorerTree()
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Explorer action failed.')
      }
    },
    [closeContextMenu, reloadExplorerTree],
  )

  const rootEntries = useMemo(() => directoryEntriesByPath[ROOT_DIRECTORY_KEY] ?? [], [directoryEntriesByPath])

  useEffect(() => {
    setDirectoryEntriesByPath({})
    setExpandedDirectories(new Set())
    setLoadingDirectories(new Set())
    setCreationDraft(null)
    setCreationName('')
    setErrorMessage(null)
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
        setSelectionDirectoryPath(nextSelectionDirectoryPath)
        setSelectedEntryPaths(new Set([targetEntry.relativePath]))
      } else {
        setSelectionDirectoryPath(ROOT_DIRECTORY_KEY)
        setSelectedEntryPaths(new Set())
      }
      setContextMenuState({
        position: {
          x: event.clientX,
          y: event.clientY,
        },
        targetEntry,
      })
    },
    [isWorkspaceConfigured],
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
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', entry.relativePath)
  }, [])

  const handleEntryDragEnd = useCallback(() => {
    draggedEntryRef.current = null
    setDropTargetDirectoryPath(null)
  }, [])

  const handleDirectoryDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      if (!draggedEntryRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
        setDropTargetDirectoryPath(targetDirectoryRelativePath)
      }
    },
    [dropTargetDirectoryPath],
  )

  const handleDirectoryDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>, targetDirectoryRelativePath: string) => {
      const draggedEntry = draggedEntryRef.current
      if (!draggedEntry) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      draggedEntryRef.current = null
      void submitMoveEntry(draggedEntry.relativePath, targetDirectoryRelativePath)
    },
    [submitMoveEntry],
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
      event.dataTransfer.dropEffect = 'copy'
      if (dropTargetDirectoryPath !== targetDirectoryRelativePath) {
        setDropTargetDirectoryPath(targetDirectoryRelativePath)
      }
    },
    [dropTargetDirectoryPath, workspaceRootPath],
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
      setDropTargetDirectoryPath(null)

      try {
        for (const filePath of filePaths) {
          await submitImportEntry(filePath, targetDirectoryRelativePath)
        }
      } finally {
        setDropTargetDirectoryPath(null)
      }
    },
    [submitImportEntry, workspaceRootPath],
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

    const confirmed = window.confirm(`Delete ${targetEntry.isDirectory ? 'folder' : 'file'} "${targetEntry.name}"?`)
    if (!confirmed) {
      closeContextMenu()
      return
    }

    void runContextAction(async () => {
      await onDeleteEntry(targetEntry.relativePath)
    })
  }, [closeContextMenu, contextMenuState, onDeleteEntry, runContextAction])

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

      requestCopyOrCutEntries([targetEntry.relativePath], mode)
    },
    [closeContextMenu, contextMenuState, requestCopyOrCutEntries],
  )

  const selectEntry = useCallback((entry: WorkspaceExplorerEntry) => {
    setSelectionDirectoryPath(getSelectionDirectoryPath(entry))
    setSelectedEntryPaths(new Set([entry.relativePath]))
  }, [])

  const selectAllEntriesInCurrentDirectory = useCallback(() => {
    const currentDirectoryEntries =
      selectionDirectoryPath === ROOT_DIRECTORY_KEY
        ? rootEntries
        : directoryEntriesByPath[selectionDirectoryPath] ?? []
    if (currentDirectoryEntries.length === 0) {
      return false
    }

    setSelectedEntryPaths(new Set(currentDirectoryEntries.map((entry) => entry.relativePath)))
    return true
  }, [directoryEntriesByPath, rootEntries, selectionDirectoryPath])

  const handleTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isTreeShortcutTarget(event.target)) {
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
        selectAllEntriesInCurrentDirectory()
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
      requestCopyOrCutEntries,
      selectAllEntriesInCurrentDirectory,
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
    (entry: WorkspaceExplorerEntry) => {
      selectEntry(entry)
      if (entry.isDirectory) {
        toggleDirectory(entry)
        return
      }

      onOpenFile(entry.relativePath)
    },
    [onOpenFile, selectEntry, toggleDirectory],
  )

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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
    handleDirectoryDragLeave,
    handleDirectoryDragOver,
    handleDirectoryDrop,
    handleExternalDragLeave,
    handleExternalDragOver,
    handleExternalDrop,
    handleEntryDragEnd,
    handleEntryDragStart,
    handleEntryClick,
    handleResizePointerDown,
    isResizing,
    isSubmittingCreationRef,
    isWorkspaceConfigured,
    loadingDirectories,
    onCreationNameChange,
    openContextMenu,
    renderedWidth,
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
