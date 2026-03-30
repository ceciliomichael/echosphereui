import { useCallback, useEffect, useRef, useState } from "react";
import { getPathBasename } from "../../lib/pathPresentation";
import { DEFAULT_DIFF_PANEL_WIDTH } from "../../lib/diffPanelSizing";
import { DEFAULT_TERMINAL_PANEL_HEIGHT } from "../../lib/terminalPanelSizing";
import { clampWorkspaceExplorerWidth } from "../../lib/workspaceExplorerSizing";
import type { WorkspaceFileTab } from "../../components/workspaceExplorer/types";
import type {
  ChatWorkspaceUiState,
  UseChatWorkspaceUiStateInput,
  WorkspaceClipboardEntry,
  WorkspaceUiSession,
} from "./chatWorkspaceUiState.types";
import {
  isWorkspacePathWithinTarget,
  normalizeWorkspaceRelativePath,
  toWorkspaceScopedKey,
} from "./chatWorkspaceUiState.utils";
import {
  clearWorkspaceAutosaveTimeoutsForWorkspace,
  createHandleSidebarOpenChange,
  restoreWorkspaceUiSession,
  saveWorkspaceUiSession,
  syncActiveWorkspacePathRef,
} from "./chatWorkspaceUiStateSessions";
import {
  createClearWorkspaceClipboardByPathPrefix,
  createWorkspaceEntryHandlers,
} from "./chatWorkspaceUiStateEntries";
import { getActiveWorkspacePanelWidth } from "./chatWorkspaceUiStatePanels";

export type {
  ChatWorkspaceUiState,
  WorkspaceClipboardEntry,
} from "./chatWorkspaceUiState.types";

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
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [workspaceFileTabs, setWorkspaceFileTabs] = useState<
    WorkspaceFileTab[]
  >([]);
  const [activeWorkspaceFilePath, setActiveWorkspaceFilePath] = useState<
    string | null
  >(null);
  const [isWorkspaceTabsPanelVisible, setIsWorkspaceTabsPanelVisible] =
    useState(false);
  const [workspaceExplorerWidth, setWorkspaceExplorerWidth] = useState(
    settings.workspaceExplorerWidth,
  );
  const [workspaceEditorWidth, setWorkspaceEditorWidth] = useState(
    settings.workspaceEditorWidth,
  );
  const [sourceControlPanelWidth, setSourceControlPanelWidth] =
    useState(diffPanelWidth);
  const [conversationDiffPanelWidth, setConversationDiffPanelWidth] =
    useState(diffPanelWidth);
  const workspaceUiSessionsRef = useRef<Record<string, WorkspaceUiSession>>({});
  const activeWorkspaceUiKey = toWorkspaceScopedKey(activeWorkspacePath);
  const previousWorkspaceUiKeyRef = useRef(activeWorkspaceUiKey);
  const activeWorkspacePathRef = useRef<string | null>(activeWorkspacePath);
  const workspaceAutosaveTimeoutsRef = useRef<Map<string, number>>(new Map());
  const [workspaceClipboard, setWorkspaceClipboard] =
    useState<WorkspaceClipboardEntry | null>(null);
  const sidebarPanelRestoreRef = useRef<{
    shouldRestoreExplorer: boolean;
    shouldRestoreRightPanel: boolean;
    shouldRestoreTabs: boolean;
  } | null>(null);

  useEffect(() => {
    syncActiveWorkspacePathRef({ activeWorkspacePath, activeWorkspacePathRef });
  }, [activeWorkspacePath]);

  useEffect(() => {
    clearWorkspaceAutosaveTimeoutsForWorkspace({
      workspaceAutosaveTimeoutsRef,
    });
  }, [activeWorkspaceUiKey]);

  useEffect(() => {
    setWorkspaceClipboard(null);
  }, [activeWorkspaceUiKey]);

  useEffect(() => {
    setWorkspaceExplorerWidth(settings.workspaceExplorerWidth);
  }, [settings.workspaceExplorerWidth]);

  useEffect(() => {
    setWorkspaceEditorWidth(settings.workspaceEditorWidth);
  }, [settings.workspaceEditorWidth]);

  useEffect(() => {
    restoreWorkspaceUiSession({
      activeWorkspaceFilePath,
      activeWorkspaceUiKey,
      isExplorerOpen,
      isRightPanelOpen,
      isWorkspaceTabsPanelVisible,
      onRightPanelOpenChange,
      onRightPanelTabChange,
      previousWorkspaceUiKeyRef,
      setActiveWorkspaceFilePath,
      setIsExplorerOpen,
      setIsWorkspaceTabsPanelVisible,
      setWorkspaceFileTabs,
      workspaceFileTabs,
      workspaceUiSessionsRef,
    });
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
  ]);

  useEffect(() => {
    saveWorkspaceUiSession({
      activeWorkspaceFilePath,
      activeWorkspaceUiKey,
      isExplorerOpen,
      isRightPanelOpen,
      isWorkspaceTabsPanelVisible,
      rightPanelTab,
      workspaceFileTabs,
      workspaceUiSessionsRef,
    });
  }, [
    activeWorkspaceFilePath,
    activeWorkspaceUiKey,
    isExplorerOpen,
    isRightPanelOpen,
    isWorkspaceTabsPanelVisible,
    rightPanelTab,
    workspaceFileTabs,
  ]);

  useEffect(
    () => () => {
      clearWorkspaceAutosaveTimeoutsForWorkspace({
        workspaceAutosaveTimeoutsRef,
      });
    },
    [],
  );

  useEffect(() => {
    function handleWindowResize() {
      setWorkspaceExplorerWidth((currentWidth) =>
        clampWorkspaceExplorerWidth(currentWidth, window.innerWidth),
      );
    }

    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  useEffect(() => {
    setWorkspaceEditorWidth((currentWidth) =>
      currentWidth === DEFAULT_DIFF_PANEL_WIDTH ? diffPanelWidth : currentWidth,
    );
    setSourceControlPanelWidth((currentWidth) =>
      currentWidth === DEFAULT_DIFF_PANEL_WIDTH ? diffPanelWidth : currentWidth,
    );
    setConversationDiffPanelWidth(diffPanelWidth);
  }, [diffPanelWidth]);

  const activeTerminalWorkspaceKey = toWorkspaceScopedKey(activeWorkspacePath);
  const isTerminalOpen =
    settings.terminalOpenByWorkspace[activeTerminalWorkspaceKey] ?? false;
  const terminalPanelHeight =
    settings.terminalPanelHeightsByWorkspace[activeTerminalWorkspaceKey] ??
    DEFAULT_TERMINAL_PANEL_HEIGHT;
  const activeWorkspacePanelWidth = getActiveWorkspacePanelWidth({
    conversationDiffPanelWidth,
    isExplorerOpen,
    isRightPanelOpen,
    rightPanelTab,
    sourceControlPanelWidth,
    workspaceExplorerWidth,
  });

  const closeWorkspaceTabsByPathPrefix = useCallback((targetPath: string) => {
    const normalizedTargetPath = normalizeWorkspaceRelativePath(targetPath);
    workspaceAutosaveTimeoutsRef.current.forEach((timeoutId, relativePath) => {
      if (!isWorkspacePathWithinTarget(relativePath, normalizedTargetPath)) {
        return;
      }
      window.clearTimeout(timeoutId);
      workspaceAutosaveTimeoutsRef.current.delete(relativePath);
    });

    setWorkspaceFileTabs((currentTabs) => {
      const nextTabs = currentTabs.filter(
        (tab) =>
          !isWorkspacePathWithinTarget(tab.relativePath, normalizedTargetPath),
      );
      if (nextTabs.length === 0) {
        setIsWorkspaceTabsPanelVisible(false);
      }
      return nextTabs;
    });

    setActiveWorkspaceFilePath((currentActivePath) => {
      if (
        !currentActivePath ||
        !isWorkspacePathWithinTarget(currentActivePath, normalizedTargetPath)
      ) {
        return currentActivePath;
      }
      return null;
    });
  }, []);

  const clearWorkspaceClipboardByPathPrefix = useCallback(
    createClearWorkspaceClipboardByPathPrefix({ setWorkspaceClipboard }),
    [],
  );

  const {
    handleCopyWorkspaceEntry,
    handleCreateWorkspaceEntry,
    handleCutWorkspaceEntry,
    handleDeleteWorkspaceEntry,
    handleImportWorkspaceEntry,
    handleMoveWorkspaceEntry,
    handlePasteWorkspaceEntry,
    handleRenameWorkspaceEntry,
  } = createWorkspaceEntryHandlers({
    activeWorkspacePathRef,
    clearWorkspaceClipboardByPathPrefix,
    closeWorkspaceTabsByPathPrefix,
    setWorkspaceClipboard,
    workspaceClipboard,
  });

  const handleOpenWorkspaceFile = useCallback(
    (relativePath: string) => {
      const workspaceRootPath = activeWorkspacePathRef.current;
      if (!workspaceRootPath) {
        return;
      }

      if (activeWorkspacePanelWidth !== null) {
        setWorkspaceExplorerWidth(activeWorkspacePanelWidth);
      }
      setIsSidebarOpen(false);
      setIsExplorerOpen(true);
      setIsWorkspaceTabsPanelVisible(true);
      onRightPanelOpenChange(false);
      setActiveWorkspaceFilePath(relativePath);
      setWorkspaceFileTabs((currentTabs) => {
        if (currentTabs.some((tab) => tab.relativePath === relativePath)) {
          return currentTabs;
        }

        return [
          ...currentTabs,
          {
            content: "",
            fileName: getPathBasename(relativePath),
            isBinary: false,
            isTruncated: false,
            relativePath,
            sizeBytes: 0,
            status: "loading",
          },
        ];
      });

      void window.echosphereWorkspace
        .readFile({
          relativePath,
          workspaceRootPath,
        })
        .then((result) => {
          if (activeWorkspacePathRef.current !== workspaceRootPath) {
            return;
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
                    status: "ready",
                  }
                : tab,
            ),
          );
        })
        .catch((error) => {
          if (activeWorkspacePathRef.current !== workspaceRootPath) {
            return;
          }

          setWorkspaceFileTabs((currentTabs) =>
            currentTabs.map((tab) =>
              tab.relativePath === relativePath
                ? {
                    ...tab,
                    errorMessage:
                      error instanceof Error
                        ? error.message
                        : "Failed to open file.",
                    status: "error",
                  }
                : tab,
            ),
          );
        });
    },
    [activeWorkspacePanelWidth, onRightPanelOpenChange, setIsSidebarOpen],
  );

  const handleCloseWorkspaceTab = useCallback((relativePath: string) => {
    const pendingAutosaveTimeout =
      workspaceAutosaveTimeoutsRef.current.get(relativePath);
    if (typeof pendingAutosaveTimeout === "number") {
      window.clearTimeout(pendingAutosaveTimeout);
      workspaceAutosaveTimeoutsRef.current.delete(relativePath);
    }

    setWorkspaceFileTabs((currentTabs) => {
      const closingIndex = currentTabs.findIndex(
        (tab) => tab.relativePath === relativePath,
      );
      if (closingIndex === -1) {
        return currentTabs;
      }

      const nextTabs = currentTabs.filter(
        (tab) => tab.relativePath !== relativePath,
      );
      if (nextTabs.length === 0) {
        setIsWorkspaceTabsPanelVisible(false);
      }
      setActiveWorkspaceFilePath((currentActiveFilePath) => {
        if (currentActiveFilePath !== relativePath) {
          return currentActiveFilePath;
        }
        const fallbackTab =
          nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? null;
        return fallbackTab?.relativePath ?? null;
      });
      return nextTabs;
    });
  }, []);

  const handleSelectWorkspaceTab = useCallback((relativePath: string) => {
    setActiveWorkspaceFilePath(relativePath);
  }, []);

  const handleWorkspaceEditorWidthChange = useCallback((nextWidth: number) => {
    setWorkspaceEditorWidth(nextWidth);
  }, []);

  const handleWorkspaceEditorWidthCommit = useCallback(
    (nextWidth: number) => {
      setWorkspaceEditorWidth(nextWidth);
      if (nextWidth !== settings.workspaceEditorWidth) {
        void onUpdateSettings({ workspaceEditorWidth: nextWidth });
      }
    },
    [onUpdateSettings, settings.workspaceEditorWidth],
  );

  const handleWorkspaceExplorerWidthChange = useCallback(
    (nextWidth: number) => {
      setWorkspaceExplorerWidth(nextWidth);
    },
    [],
  );

  const handleWorkspaceExplorerWidthCommit = useCallback(
    (nextWidth: number) => {
      setWorkspaceExplorerWidth(nextWidth);
      if (nextWidth !== settings.workspaceExplorerWidth) {
        void onUpdateSettings({ workspaceExplorerWidth: nextWidth });
      }
    },
    [onUpdateSettings, settings.workspaceExplorerWidth],
  );

  const handleConversationDiffPanelWidthChange = useCallback(
    (nextWidth: number) => {
      setConversationDiffPanelWidth(nextWidth);
    },
    [],
  );

  const handleConversationDiffPanelWidthCommit = useCallback(
    (nextWidth: number) => {
      setConversationDiffPanelWidth(nextWidth);
      onDiffPanelWidthChange(nextWidth);
      onDiffPanelWidthCommit(nextWidth);
    },
    [onDiffPanelWidthChange, onDiffPanelWidthCommit],
  );

  const handleSourceControlPanelWidthChange = useCallback(
    (nextWidth: number) => {
      setSourceControlPanelWidth(nextWidth);
    },
    [],
  );

  const handleSourceControlPanelWidthCommit = useCallback(
    (nextWidth: number) => {
      setSourceControlPanelWidth(nextWidth);
    },
    [],
  );

  const handleWorkspaceFileContentChange = useCallback((relativePath: string, content: string) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      return;
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
    );

    const pendingAutosaveTimeout = workspaceAutosaveTimeoutsRef.current.get(relativePath);
    if (typeof pendingAutosaveTimeout === 'number') {
      window.clearTimeout(pendingAutosaveTimeout);
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
            return;
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
          );
        })
        .catch((error) => {
          console.error(`Failed to autosave ${relativePath}`, error);
        })
        .finally(() => {
          const activeTimeoutId = workspaceAutosaveTimeoutsRef.current.get(relativePath);
          if (activeTimeoutId === timeoutId) {
            workspaceAutosaveTimeoutsRef.current.delete(relativePath);
          }
        });
    }, 220);

    workspaceAutosaveTimeoutsRef.current.set(relativePath, timeoutId);
  }, []);

  const handleOpenSourceControlPanel = useCallback(() => {
    setIsExplorerOpen(false);
    if (isSidebarOpen) {
      setIsWorkspaceTabsPanelVisible(false);
    } else if (workspaceFileTabs.length > 0) {
      setIsWorkspaceTabsPanelVisible(true);
    }
    if (activeWorkspacePanelWidth !== null) {
      setSourceControlPanelWidth(activeWorkspacePanelWidth);
    }
    if (isRightPanelOpen && rightPanelTab === "source-control") {
      onRightPanelOpenChange(false);
      return;
    }

    onRightPanelTabChange("source-control");
    onRightPanelOpenChange(true);
  }, [
    activeWorkspacePanelWidth,
    isRightPanelOpen,
    isSidebarOpen,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    rightPanelTab,
    workspaceFileTabs.length,
  ]);

  const handleOpenDiffPanel = useCallback(() => {
    setIsExplorerOpen(false);
    if (isSidebarOpen) {
      setIsWorkspaceTabsPanelVisible(false);
    } else if (workspaceFileTabs.length > 0) {
      setIsWorkspaceTabsPanelVisible(true);
    }
    if (activeWorkspacePanelWidth !== null) {
      setConversationDiffPanelWidth(activeWorkspacePanelWidth);
    }
    if (isRightPanelOpen && rightPanelTab === "diff") {
      onRightPanelOpenChange(false);
      return;
    }

    onRightPanelTabChange("diff");
    onRightPanelOpenChange(true);
  }, [
    activeWorkspacePanelWidth,
    isRightPanelOpen,
    isSidebarOpen,
    onRightPanelOpenChange,
    onRightPanelTabChange,
    rightPanelTab,
    workspaceFileTabs.length,
  ]);

  const handleToggleExplorerPanel = useCallback(() => {
    setIsExplorerOpen((currentValue) => {
      const nextValue = !currentValue;
      if (nextValue) {
        if (activeWorkspacePanelWidth !== null) {
          setWorkspaceExplorerWidth(activeWorkspacePanelWidth);
        }
        if (isSidebarOpen) {
          sidebarPanelRestoreRef.current = null;
          setIsSidebarOpen(false);
          if (workspaceFileTabs.length > 0) {
            setIsWorkspaceTabsPanelVisible(true);
          }
        } else if (workspaceFileTabs.length > 0) {
          setIsWorkspaceTabsPanelVisible(true);
        }

        onRightPanelOpenChange(false);
      }
      return nextValue;
    });
  }, [
    activeWorkspacePanelWidth,
    isSidebarOpen,
    onRightPanelOpenChange,
    setIsSidebarOpen,
    workspaceFileTabs.length,
  ]);

  const handleSidebarOpenChange = useCallback(
    createHandleSidebarOpenChange({
      isExplorerOpen,
      isRightPanelOpen,
      isWorkspaceTabsPanelVisible,
      onRightPanelOpenChange,
      setIsExplorerOpen,
      setIsWorkspaceTabsPanelVisible,
      sidebarPanelRestoreRef,
      workspaceFileTabsLength: workspaceFileTabs.length,
    }),
    [
      isExplorerOpen,
      isRightPanelOpen,
      isWorkspaceTabsPanelVisible,
      onRightPanelOpenChange,
      workspaceFileTabs.length,
    ],
  );

  const isWorkspaceTabsPanelOpen =
    isWorkspaceTabsPanelVisible && workspaceFileTabs.length > 0;

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
    handleImportWorkspaceEntry,
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
  };
}
