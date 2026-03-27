import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatInterfaceRightPanelTab } from '../../hooks/useChatInterfaceController'
import { DEFAULT_DIFF_PANEL_WIDTH } from '../../lib/diffPanelSizing'
import { getPathBasename } from '../../lib/pathPresentation'
import { DEFAULT_TERMINAL_PANEL_HEIGHT } from '../../lib/terminalPanelSizing'
import { clampWorkspaceExplorerWidth } from '../../lib/workspaceExplorerSizing'
import type { AppSettings } from '../../types/chat'
import type { WorkspaceFileTab } from '../../components/workspaceExplorer/types'

const DEFAULT_TERMINAL_WORKSPACE_KEY = '__global__'

interface WorkspaceUiSession {
  activeFilePath: string | null
  isExplorerOpen: boolean
  isRightPanelOpen: boolean
  isTabsVisible: boolean
  rightPanelTab: ChatInterfaceRightPanelTab
  tabs: WorkspaceFileTab[]
}

export interface WorkspaceClipboardEntry {
  mode: 'copy' | 'cut'
  relativePath: string
}

interface UseChatWorkspaceUiStateInput {
  activeWorkspacePath: string | null
  diffPanelWidth: number
  isRightPanelOpen: boolean
  isSidebarOpen: boolean
  onDiffPanelWidthChange: (nextWidth: number) => void
  onDiffPanelWidthCommit: (nextWidth: number) => void
  onRightPanelOpenChange: (nextValue: boolean) => void
  onRightPanelTabChange: (nextTab: ChatInterfaceRightPanelTab) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  rightPanelTab: ChatInterfaceRightPanelTab
  setIsSidebarOpen: (nextValue: boolean) => void
  settings: AppSettings
}

export interface ChatWorkspaceUiState {
  activeWorkspaceFilePath: string | null
  activeWorkspacePath: string | null
  conversationDiffPanelWidth: number
  handleCloseWorkspaceTab: (relativePath: string) => void
  handleConversationDiffPanelWidthChange: (nextWidth: number) => void
  handleConversationDiffPanelWidthCommit: (nextWidth: number) => void
  handleCopyWorkspaceEntry: (relativePath: string) => Promise<void>
  handleCreateWorkspaceEntry: (relativePath: string, isDirectory: boolean) => Promise<void>
  handleCutWorkspaceEntry: (relativePath: string) => Promise<void>
  handleDeleteWorkspaceEntry: (relativePath: string) => Promise<void>
  handleMoveWorkspaceEntry: (relativePath: string, targetDirectoryRelativePath: string) => Promise<void>
  handleOpenDiffPanel: () => void
  handleOpenSourceControlPanel: () => void
  handleOpenWorkspaceFile: (relativePath: string) => void
  handlePasteWorkspaceEntry: (targetDirectoryRelativePath: string) => Promise<void>
  handleRenameWorkspaceEntry: (relativePath: string, nextRelativePath: string) => Promise<void>
  handleSelectWorkspaceTab: (relativePath: string) => void
  handleSourceControlPanelWidthChange: (nextWidth: number) => void
  handleSourceControlPanelWidthCommit: (nextWidth: number) => void
  handleSidebarOpenChange: (nextSidebarOpen: boolean) => void
  handleToggleExplorerPanel: () => void
  handleWorkspaceEditorWidthChange: (nextWidth: number) => void
  handleWorkspaceEditorWidthCommit: (nextWidth: number) => void
  handleWorkspaceExplorerWidthChange: (nextWidth: number) => void
  handleWorkspaceExplorerWidthCommit: (nextWidth: number) => void
  handleWorkspaceFileContentChange: (relativePath: string, content: string) => void
  isExplorerOpen: boolean
  isTerminalOpen: boolean
  isWorkspaceTabsPanelOpen: boolean
  sourceControlPanelWidth: number
  terminalPanelHeight: number
  workspaceClipboard: WorkspaceClipboardEntry | null
  workspaceEditorWidth: number
  workspaceExplorerWidth: number
  workspaceFileTabs: WorkspaceFileTab[]
}

function toWorkspaceScopedKey(workspacePath: string | null) {
  const normalizedPath = workspacePath?.trim() ?? ''
  if (normalizedPath.length === 0) {
    return DEFAULT_TERMINAL_WORKSPACE_KEY
  }

  return normalizedPath
}

function normalizeWorkspaceRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, '/')
}

function isWorkspacePathWithinTarget(entryPath: string, targetPath: string) {
  const normalizedEntryPath = normalizeWorkspaceRelativePath(entryPath)
  const normalizedTargetPath = normalizeWorkspaceRelativePath(targetPath)
  return normalizedEntryPath === normalizedTargetPath || normalizedEntryPath.startsWith(`${normalizedTargetPath}/`)
}

export function useChatWorkspaceUiState({
  activeWorkspacePath,
  diffPanelWidth,
  isRightPanelOpen,
  isSidebarOpen,
  onDiffPanelWidthChange,
  onDiffPanelWidthCommit,
  onRightPanelOpenChange,
  onRightPanelTabChange,
  onUpdateSettings,
  rightPanelTab,
  setIsSidebarOpen,
  settings,
}: UseChatWorkspaceUiStateInput): ChatWorkspaceUiState {
  const [isExplorerOpen, setIsExplorerOpen] = useState(false)
  const [workspaceFileTabs, setWorkspaceFileTabs] = useState<WorkspaceFileTab[]>([])
  const [activeWorkspaceFilePath, setActiveWorkspaceFilePath] = useState<string | null>(null)
  const [isWorkspaceTabsPanelVisible, setIsWorkspaceTabsPanelVisible] = useState(false)
  const [workspaceExplorerWidth, setWorkspaceExplorerWidth] = useState(settings.workspaceExplorerWidth)
  const [workspaceEditorWidth, setWorkspaceEditorWidth] = useState(settings.workspaceEditorWidth)
  const [sourceControlPanelWidth, setSourceControlPanelWidth] = useState(diffPanelWidth)
  const [conversationDiffPanelWidth, setConversationDiffPanelWidth] = useState(diffPanelWidth)
  const workspaceUiSessionsRef = useRef<Record<string, WorkspaceUiSession>>({})
  const activeWorkspaceUiKey = toWorkspaceScopedKey(activeWorkspacePath)
  const previousWorkspaceUiKeyRef = useRef(activeWorkspaceUiKey)
  const activeWorkspacePathRef = useRef<string | null>(activeWorkspacePath)
  const workspaceAutosaveTimeoutsRef = useRef<Map<string, number>>(new Map())
  const [workspaceClipboard, setWorkspaceClipboard] = useState<WorkspaceClipboardEntry | null>(null)
  const sidebarPanelRestoreRef = useRef<{
    shouldRestoreExplorer: boolean
    shouldRestoreRightPanel: boolean
    shouldRestoreTabs: boolean
  } | null>(null)

  const handleSidebarOpenChange = useCallback(
    (nextSidebarOpen: boolean) => {
      if (nextSidebarOpen) {
        const shouldCloseTabs = isWorkspaceTabsPanelVisible && workspaceFileTabs.length > 0
        const shouldCloseRightPanel = isRightPanelOpen
        const shouldCloseExplorer = isExplorerOpen
        const shouldClosePanels = shouldCloseTabs || shouldCloseRightPanel || shouldCloseExplorer

        if (!shouldClosePanels) {
          sidebarPanelRestoreRef.current = null
          return
        }

        sidebarPanelRestoreRef.current = {
          shouldRestoreExplorer: shouldCloseExplorer,
          shouldRestoreRightPanel: shouldCloseRightPanel,
          shouldRestoreTabs: shouldCloseTabs,
        }

        if (shouldCloseTabs) {
          setIsWorkspaceTabsPanelVisible(false)
        }
        if (shouldCloseRightPanel) {
          onRightPanelOpenChange(false)
        }
        if (shouldCloseExplorer) {
          setIsExplorerOpen(false)
        }
        return
      }

      const restoreState = sidebarPanelRestoreRef.current
      sidebarPanelRestoreRef.current = null
      if (!restoreState) {
        return
      }

      if (restoreState.shouldRestoreTabs && workspaceFileTabs.length > 0) {
        setIsWorkspaceTabsPanelVisible(true)
      }
      if (restoreState.shouldRestoreRightPanel) {
        onRightPanelOpenChange(true)
      }
      if (restoreState.shouldRestoreExplorer) {
        setIsExplorerOpen(true)
      }
    },
    [isExplorerOpen, isRightPanelOpen, isWorkspaceTabsPanelVisible, onRightPanelOpenChange, workspaceFileTabs.length],
  )

  useEffect(() => {
    activeWorkspacePathRef.current = activeWorkspacePath
  }, [activeWorkspacePath])

  useEffect(() => {
    workspaceAutosaveTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    workspaceAutosaveTimeoutsRef.current.clear()
  }, [activeWorkspaceUiKey])

  useEffect(() => {
    setWorkspaceClipboard(null)
  }, [activeWorkspaceUiKey])

  useEffect(() => {
    setWorkspaceExplorerWidth(settings.workspaceExplorerWidth)
  }, [settings.workspaceExplorerWidth])

  useEffect(() => {
    setWorkspaceEditorWidth(settings.workspaceEditorWidth)
  }, [settings.workspaceEditorWidth])

  useEffect(() => {
    const previousWorkspaceUiKey = previousWorkspaceUiKeyRef.current
    if (previousWorkspaceUiKey === activeWorkspaceUiKey) {
      return
    }

    workspaceUiSessionsRef.current[previousWorkspaceUiKey] = {
      activeFilePath: activeWorkspaceFilePath,
      isExplorerOpen,
      isRightPanelOpen,
      isTabsVisible: isWorkspaceTabsPanelVisible,
      rightPanelTab,
      tabs: workspaceFileTabs,
    }

    const nextSession = workspaceUiSessionsRef.current[activeWorkspaceUiKey]
    if (nextSession) {
      setWorkspaceFileTabs(nextSession.tabs)
      setActiveWorkspaceFilePath(nextSession.activeFilePath)
      setIsWorkspaceTabsPanelVisible(nextSession.isTabsVisible)
      setIsExplorerOpen(nextSession.isExplorerOpen)
      onRightPanelTabChange(nextSession.rightPanelTab)
      onRightPanelOpenChange(nextSession.isRightPanelOpen)
    } else {
      setWorkspaceFileTabs([])
      setActiveWorkspaceFilePath(null)
      setIsWorkspaceTabsPanelVisible(false)
      setIsExplorerOpen(false)
      onRightPanelTabChange('diff')
      onRightPanelOpenChange(false)
    }

    previousWorkspaceUiKeyRef.current = activeWorkspaceUiKey
  }, [
    activeWorkspaceFilePath,
    activeWorkspaceUiKey,
    isExplorerOpen,
    isRightPanelOpen,
    isWorkspaceTabsPanelVisible,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    rightPanelTab,
    workspaceFileTabs,
  ])

  useEffect(() => {
    workspaceUiSessionsRef.current[activeWorkspaceUiKey] = {
      activeFilePath: activeWorkspaceFilePath,
      isExplorerOpen,
      isRightPanelOpen,
      isTabsVisible: isWorkspaceTabsPanelVisible,
      rightPanelTab,
      tabs: workspaceFileTabs,
    }
  }, [
    activeWorkspaceFilePath,
    activeWorkspaceUiKey,
    isExplorerOpen,
    isRightPanelOpen,
    isWorkspaceTabsPanelVisible,
    rightPanelTab,
    workspaceFileTabs,
  ])

  useEffect(
    () => () => {
      workspaceAutosaveTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      workspaceAutosaveTimeoutsRef.current.clear()
    },
    [],
  )

  useEffect(() => {
    function handleWindowResize() {
      setWorkspaceExplorerWidth((currentWidth) => clampWorkspaceExplorerWidth(currentWidth, window.innerWidth))
    }

    handleWindowResize()
    window.addEventListener('resize', handleWindowResize)
    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  useEffect(() => {
    setWorkspaceEditorWidth((currentWidth) => (currentWidth === DEFAULT_DIFF_PANEL_WIDTH ? diffPanelWidth : currentWidth))
    setSourceControlPanelWidth((currentWidth) => (currentWidth === DEFAULT_DIFF_PANEL_WIDTH ? diffPanelWidth : currentWidth))
    setConversationDiffPanelWidth(diffPanelWidth)
  }, [diffPanelWidth])

  const activeTerminalWorkspaceKey = toWorkspaceScopedKey(activeWorkspacePath)
  const isTerminalOpen = settings.terminalOpenByWorkspace[activeTerminalWorkspaceKey] ?? false
  const terminalPanelHeight =
    settings.terminalPanelHeightsByWorkspace[activeTerminalWorkspaceKey] ?? DEFAULT_TERMINAL_PANEL_HEIGHT
  const activeWorkspacePanelWidth = isExplorerOpen
    ? workspaceExplorerWidth
    : isRightPanelOpen
      ? rightPanelTab === 'diff'
        ? conversationDiffPanelWidth
        : sourceControlPanelWidth
      : null

  const closeWorkspaceTabsByPathPrefix = useCallback(
    (targetPath: string) => {
      const normalizedTargetPath = normalizeWorkspaceRelativePath(targetPath)
      workspaceAutosaveTimeoutsRef.current.forEach((timeoutId, relativePath) => {
        if (!isWorkspacePathWithinTarget(relativePath, normalizedTargetPath)) {
          return
        }
        window.clearTimeout(timeoutId)
        workspaceAutosaveTimeoutsRef.current.delete(relativePath)
      })

      setWorkspaceFileTabs((currentTabs) => {
        const nextTabs = currentTabs.filter(
          (tab) => !isWorkspacePathWithinTarget(tab.relativePath, normalizedTargetPath),
        )
        if (nextTabs.length === 0) {
          setIsWorkspaceTabsPanelVisible(false)
        }
        return nextTabs
      })

      setActiveWorkspaceFilePath((currentActivePath) => {
        if (!currentActivePath || !isWorkspacePathWithinTarget(currentActivePath, normalizedTargetPath)) {
          return currentActivePath
        }
        return null
      })
    },
    [],
  )

  const clearWorkspaceClipboardByPathPrefix = useCallback((targetPath: string) => {
    setWorkspaceClipboard((currentClipboard) => {
      if (!currentClipboard || !isWorkspacePathWithinTarget(currentClipboard.relativePath, targetPath)) {
        return currentClipboard
      }
      return null
    })
  }, [])

  const handleCreateWorkspaceEntry = useCallback(async (relativePath: string, isDirectory: boolean) => {
    const workspaceRootPath = activeWorkspacePathRef.current
    if (!workspaceRootPath) {
      throw new Error('Select a workspace folder first.')
    }

    await window.echosphereWorkspace.createEntry({
      isDirectory,
      relativePath,
      workspaceRootPath,
    })
  }, [])

  const handleRenameWorkspaceEntry = useCallback(
    async (relativePath: string, nextRelativePath: string) => {
      const workspaceRootPath = activeWorkspacePathRef.current
      if (!workspaceRootPath) {
        throw new Error('Select a workspace folder first.')
      }

      await window.echosphereWorkspace.renameEntry({
        nextRelativePath,
        relativePath,
        workspaceRootPath,
      })
      clearWorkspaceClipboardByPathPrefix(relativePath)
      closeWorkspaceTabsByPathPrefix(relativePath)
    },
    [clearWorkspaceClipboardByPathPrefix, closeWorkspaceTabsByPathPrefix],
  )

  const handleDeleteWorkspaceEntry = useCallback(
    async (relativePath: string) => {
      const workspaceRootPath = activeWorkspacePathRef.current
      if (!workspaceRootPath) {
        throw new Error('Select a workspace folder first.')
      }

      await window.echosphereWorkspace.deleteEntry({
        relativePath,
        workspaceRootPath,
      })
      clearWorkspaceClipboardByPathPrefix(relativePath)
      closeWorkspaceTabsByPathPrefix(relativePath)
    },
    [clearWorkspaceClipboardByPathPrefix, closeWorkspaceTabsByPathPrefix],
  )

  const handleCopyWorkspaceEntry = useCallback(async (relativePath: string) => {
    setWorkspaceClipboard({
      mode: 'copy',
      relativePath,
    })
  }, [])

  const handleCutWorkspaceEntry = useCallback(async (relativePath: string) => {
    setWorkspaceClipboard({
      mode: 'cut',
      relativePath,
    })
  }, [])

  const handlePasteWorkspaceEntry = useCallback(
    async (targetDirectoryRelativePath: string) => {
      const workspaceRootPath = activeWorkspacePathRef.current
      if (!workspaceRootPath) {
        throw new Error('Select a workspace folder first.')
      }
      if (!workspaceClipboard) {
        throw new Error('Nothing to paste.')
      }

      const result = await window.echosphereWorkspace.transferEntry({
        mode: workspaceClipboard.mode === 'cut' ? 'move' : 'copy',
        relativePath: workspaceClipboard.relativePath,
        targetDirectoryRelativePath,
        workspaceRootPath,
      })

      if (result.mode === 'move' && result.targetRelativePath !== result.relativePath) {
        clearWorkspaceClipboardByPathPrefix(result.relativePath)
        closeWorkspaceTabsByPathPrefix(result.relativePath)
      }
    },
    [clearWorkspaceClipboardByPathPrefix, closeWorkspaceTabsByPathPrefix, workspaceClipboard],
  )

  const handleMoveWorkspaceEntry = useCallback(
    async (relativePath: string, targetDirectoryRelativePath: string) => {
      const workspaceRootPath = activeWorkspacePathRef.current
      if (!workspaceRootPath) {
        throw new Error('Select a workspace folder first.')
      }

      const result = await window.echosphereWorkspace.transferEntry({
        mode: 'move',
        relativePath,
        targetDirectoryRelativePath,
        workspaceRootPath,
      })

      if (result.targetRelativePath !== result.relativePath) {
        clearWorkspaceClipboardByPathPrefix(result.relativePath)
        closeWorkspaceTabsByPathPrefix(result.relativePath)
      }
    },
    [clearWorkspaceClipboardByPathPrefix, closeWorkspaceTabsByPathPrefix],
  )

  const handleOpenWorkspaceFile = useCallback(
    (relativePath: string) => {
      const workspaceRootPath = activeWorkspacePathRef.current
      if (!workspaceRootPath) {
        return
      }

      if (activeWorkspacePanelWidth !== null) {
        setWorkspaceExplorerWidth(activeWorkspacePanelWidth)
      }
      setIsSidebarOpen(false)
      setIsExplorerOpen(true)
      setIsWorkspaceTabsPanelVisible(true)
      onRightPanelOpenChange(false)
      setActiveWorkspaceFilePath(relativePath)
      setWorkspaceFileTabs((currentTabs) => {
        if (currentTabs.some((tab) => tab.relativePath === relativePath)) {
          return currentTabs
        }

        return [
          ...currentTabs,
          {
            content: '',
            fileName: getPathBasename(relativePath),
            isBinary: false,
            isTruncated: false,
            relativePath,
            sizeBytes: 0,
            status: 'loading',
          },
        ]
      })

      void window.echosphereWorkspace
        .readFile({
          relativePath,
          workspaceRootPath,
        })
        .then((result) => {
          if (activeWorkspacePathRef.current !== workspaceRootPath) {
            return
          }

          setWorkspaceFileTabs((currentTabs) =>
            currentTabs.map((tab) =>
              tab.relativePath === relativePath
                ? {
                    content: result.content,
                    fileName: getPathBasename(result.relativePath),
                    isBinary: result.isBinary,
                    isTruncated: result.isTruncated,
                    relativePath: result.relativePath,
                    sizeBytes: result.sizeBytes,
                    status: 'ready',
                  }
                : tab,
            ),
          )
        })
        .catch((error) => {
          if (activeWorkspacePathRef.current !== workspaceRootPath) {
            return
          }

          setWorkspaceFileTabs((currentTabs) =>
            currentTabs.map((tab) =>
              tab.relativePath === relativePath
                ? {
                    ...tab,
                    errorMessage: error instanceof Error ? error.message : 'Failed to open file.',
                    status: 'error',
                  }
                : tab,
            ),
          )
        })
    },
    [activeWorkspacePanelWidth, onRightPanelOpenChange, setIsSidebarOpen],
  )

  const handleCloseWorkspaceTab = useCallback((relativePath: string) => {
    const pendingAutosaveTimeout = workspaceAutosaveTimeoutsRef.current.get(relativePath)
    if (typeof pendingAutosaveTimeout === 'number') {
      window.clearTimeout(pendingAutosaveTimeout)
      workspaceAutosaveTimeoutsRef.current.delete(relativePath)
    }

    setWorkspaceFileTabs((currentTabs) => {
      const closingIndex = currentTabs.findIndex((tab) => tab.relativePath === relativePath)
      if (closingIndex === -1) {
        return currentTabs
      }

      const nextTabs = currentTabs.filter((tab) => tab.relativePath !== relativePath)
      if (nextTabs.length === 0) {
        setIsWorkspaceTabsPanelVisible(false)
      }
      setActiveWorkspaceFilePath((currentActiveFilePath) => {
        if (currentActiveFilePath !== relativePath) {
          return currentActiveFilePath
        }
        const fallbackTab = nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? null
        return fallbackTab?.relativePath ?? null
      })
      return nextTabs
    })
  }, [])

  const handleSelectWorkspaceTab = useCallback((relativePath: string) => {
    setActiveWorkspaceFilePath(relativePath)
  }, [])

  const handleWorkspaceEditorWidthChange = useCallback((nextWidth: number) => {
    setWorkspaceEditorWidth(nextWidth)
  }, [])

  const handleWorkspaceEditorWidthCommit = useCallback(
    (nextWidth: number) => {
      setWorkspaceEditorWidth(nextWidth)
      if (nextWidth !== settings.workspaceEditorWidth) {
        void onUpdateSettings({ workspaceEditorWidth: nextWidth })
      }
    },
    [onUpdateSettings, settings.workspaceEditorWidth],
  )

  const handleWorkspaceExplorerWidthChange = useCallback((nextWidth: number) => {
    setWorkspaceExplorerWidth(nextWidth)
  }, [])

  const handleWorkspaceExplorerWidthCommit = useCallback(
    (nextWidth: number) => {
      setWorkspaceExplorerWidth(nextWidth)
      if (nextWidth !== settings.workspaceExplorerWidth) {
        void onUpdateSettings({ workspaceExplorerWidth: nextWidth })
      }
    },
    [onUpdateSettings, settings.workspaceExplorerWidth],
  )

  const handleConversationDiffPanelWidthChange = useCallback((nextWidth: number) => {
    setConversationDiffPanelWidth(nextWidth)
  }, [])

  const handleConversationDiffPanelWidthCommit = useCallback(
    (nextWidth: number) => {
      setConversationDiffPanelWidth(nextWidth)
      onDiffPanelWidthChange(nextWidth)
      onDiffPanelWidthCommit(nextWidth)
    },
    [onDiffPanelWidthChange, onDiffPanelWidthCommit],
  )

  const handleSourceControlPanelWidthChange = useCallback((nextWidth: number) => {
    setSourceControlPanelWidth(nextWidth)
  }, [])

  const handleSourceControlPanelWidthCommit = useCallback(
    (nextWidth: number) => {
      setSourceControlPanelWidth(nextWidth)
    },
    [],
  )

  const handleWorkspaceFileContentChange = useCallback((relativePath: string, content: string) => {
    const workspaceRootPath = activeWorkspacePathRef.current
    if (!workspaceRootPath) {
      return
    }

    setWorkspaceFileTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.relativePath === relativePath
          ? {
              ...tab,
              content,
              sizeBytes: new TextEncoder().encode(content).length,
            }
          : tab,
      ),
    )

    const pendingAutosaveTimeout = workspaceAutosaveTimeoutsRef.current.get(relativePath)
    if (typeof pendingAutosaveTimeout === 'number') {
      window.clearTimeout(pendingAutosaveTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      void window.echosphereWorkspace
        .writeFile({
          content,
          relativePath,
          workspaceRootPath,
        })
        .then((result) => {
          if (activeWorkspacePathRef.current !== workspaceRootPath) {
            return
          }

          setWorkspaceFileTabs((currentTabs) =>
            currentTabs.map((tab) =>
              tab.relativePath === relativePath
                ? {
                    ...tab,
                    sizeBytes: result.sizeBytes,
                  }
                : tab,
            ),
          )
        })
        .catch((error) => {
          console.error(`Failed to autosave ${relativePath}`, error)
        })
        .finally(() => {
          const activeTimeoutId = workspaceAutosaveTimeoutsRef.current.get(relativePath)
          if (activeTimeoutId === timeoutId) {
            workspaceAutosaveTimeoutsRef.current.delete(relativePath)
          }
        })
    }, 220)

    workspaceAutosaveTimeoutsRef.current.set(relativePath, timeoutId)
  }, [])

  const handleOpenSourceControlPanel = useCallback(() => {
    setIsExplorerOpen(false)
    if (isSidebarOpen) {
      setIsWorkspaceTabsPanelVisible(false)
    } else if (workspaceFileTabs.length > 0) {
      setIsWorkspaceTabsPanelVisible(true)
    }
    if (activeWorkspacePanelWidth !== null) {
      setSourceControlPanelWidth(activeWorkspacePanelWidth)
    }
    if (isRightPanelOpen && rightPanelTab === 'source-control') {
      onRightPanelOpenChange(false)
      return
    }

    onRightPanelTabChange('source-control')
    onRightPanelOpenChange(true)
  }, [
    activeWorkspacePanelWidth,
    isRightPanelOpen,
    isSidebarOpen,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    rightPanelTab,
    setSourceControlPanelWidth,
    workspaceFileTabs.length,
  ])

  const handleOpenDiffPanel = useCallback(() => {
    setIsExplorerOpen(false)
    if (isSidebarOpen) {
      setIsWorkspaceTabsPanelVisible(false)
    } else if (workspaceFileTabs.length > 0) {
      setIsWorkspaceTabsPanelVisible(true)
    }
    if (activeWorkspacePanelWidth !== null) {
      setConversationDiffPanelWidth(activeWorkspacePanelWidth)
    }
    if (isRightPanelOpen && rightPanelTab === 'diff') {
      onRightPanelOpenChange(false)
      return
    }

    onRightPanelTabChange('diff')
    onRightPanelOpenChange(true)
  }, [
    activeWorkspacePanelWidth,
    isRightPanelOpen,
    isSidebarOpen,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    rightPanelTab,
    setConversationDiffPanelWidth,
    workspaceFileTabs.length,
  ])

  const handleToggleExplorerPanel = useCallback(() => {
    setIsExplorerOpen((currentValue) => {
      const nextValue = !currentValue
      if (nextValue) {
        if (activeWorkspacePanelWidth !== null) {
          setWorkspaceExplorerWidth(activeWorkspacePanelWidth)
        }
        if (isSidebarOpen) {
          sidebarPanelRestoreRef.current = null
          setIsSidebarOpen(false)
          if (workspaceFileTabs.length > 0) {
            setIsWorkspaceTabsPanelVisible(true)
          }
        } else if (workspaceFileTabs.length > 0) {
          setIsWorkspaceTabsPanelVisible(true)
        }

        onRightPanelOpenChange(false)
      }
      return nextValue
    })
  }, [activeWorkspacePanelWidth, isSidebarOpen, onRightPanelOpenChange, setIsSidebarOpen, workspaceFileTabs.length])

  const isWorkspaceTabsPanelOpen = isWorkspaceTabsPanelVisible && workspaceFileTabs.length > 0

  return {
    activeWorkspaceFilePath,
    activeWorkspacePath,
    conversationDiffPanelWidth,
    handleCloseWorkspaceTab,
    handleConversationDiffPanelWidthChange,
    handleConversationDiffPanelWidthCommit,
    handleCopyWorkspaceEntry,
    handleCreateWorkspaceEntry,
    handleCutWorkspaceEntry,
    handleDeleteWorkspaceEntry,
    handleMoveWorkspaceEntry,
    handleOpenDiffPanel,
    handleOpenSourceControlPanel,
    handleOpenWorkspaceFile,
    handlePasteWorkspaceEntry,
    handleRenameWorkspaceEntry,
    handleSelectWorkspaceTab,
    handleSourceControlPanelWidthChange,
    handleSourceControlPanelWidthCommit,
    handleSidebarOpenChange,
    handleToggleExplorerPanel,
    handleWorkspaceEditorWidthChange,
    handleWorkspaceEditorWidthCommit,
    handleWorkspaceExplorerWidthChange,
    handleWorkspaceExplorerWidthCommit,
    handleWorkspaceFileContentChange,
    isExplorerOpen,
    isTerminalOpen,
    isWorkspaceTabsPanelOpen,
    sourceControlPanelWidth,
    terminalPanelHeight,
    workspaceClipboard,
    workspaceEditorWidth,
    workspaceExplorerWidth,
    workspaceFileTabs,
  }
}
