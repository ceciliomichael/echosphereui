import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type { IDisposable, ITerminalOptions } from "@xterm/xterm";
import {
  MAX_TERMINAL_PANEL_HEIGHT,
  MIN_TERMINAL_PANEL_HEIGHT,
  clampStoredTerminalPanelHeight,
} from "../../lib/terminalPanelSizing";
import type { ResolvedTheme } from "../../lib/theme";
import { Tooltip } from "../Tooltip";
import "@xterm/xterm/css/xterm.css";

const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 6;
const TERMINAL_THEME_SYNC_DELAY_MS = 200;

type TerminalTheme = NonNullable<ITerminalOptions["theme"]>;
type TerminalTabStatus = "connecting" | "ready" | "error" | "exited";

interface WorkspaceTerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onHeightCommit: (nextHeight: number) => void;
  resolvedTheme: ResolvedTheme;
  storedHeight: number;
  workspaceKey: string;
  workspacePath: string | null;
}

interface TerminalTabState {
  errorMessage: string | null;
  exitCode: number | null;
  key: string;
  label: string;
  sessionId: number | null;
  status: TerminalTabStatus;
}

interface TerminalWorkspaceState {
  activeTerminalTabKey: string | null;
  nextTabIndex: number;
  terminalTabs: TerminalTabState[];
}

function clampPanelHeight(nextHeight: number, maxHeightLimit: number) {
  const safeMaxHeight = Math.max(MIN_TERMINAL_PANEL_HEIGHT, maxHeightLimit);
  return Math.max(
    MIN_TERMINAL_PANEL_HEIGHT,
    Math.min(nextHeight, safeMaxHeight),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Failed to process terminal action.";
}

function getSessionDimensions(terminal: Terminal) {
  return {
    cols: Math.max(MIN_TERMINAL_COLS, terminal.cols || 80),
    rows: Math.max(MIN_TERMINAL_ROWS, terminal.rows || 24),
  };
}

function getNativeSelectionTextWithinHost(hostElement: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) {
    return "";
  }

  const isAnchorInsideHost = hostElement.contains(anchorNode);
  const isFocusInsideHost = hostElement.contains(focusNode);
  if (!isAnchorInsideHost && !isFocusInsideHost) {
    return "";
  }

  return selection.toString();
}

function getTerminalTheme(
  hostElement: HTMLElement,
  resolvedTheme: ResolvedTheme,
): TerminalTheme {
  const hostStyles = window.getComputedStyle(hostElement);
  const foreground = hostStyles.color;
  const background = hostStyles.backgroundColor;
  const lightModeTextColor = "#101011";

  if (resolvedTheme === "dark") {
    return {
      background,
      foreground,
      cursor: foreground,
      selectionBackground: "rgb(135 113 255 / 0.34)",
      selectionInactiveBackground: "rgb(135 113 255 / 0.22)",
      black: "#1f1f21",
      red: "#f48771",
      green: "#9ad792",
      yellow: "#f5d76e",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#d9d9da",
      brightBlack: "#7d7d83",
      brightRed: "#ffb3a7",
      brightGreen: "#b8e8ae",
      brightYellow: "#f8e194",
      brightBlue: "#a6bcff",
      brightMagenta: "#d8c1ff",
      brightCyan: "#9be6ff",
      brightWhite: "#ffffff",
    };
  }

  return {
    background,
    foreground: lightModeTextColor,
    cursor: lightModeTextColor,
    selectionBackground: "rgb(59 130 246 / 0.30)",
    selectionInactiveBackground: "rgb(59 130 246 / 0.20)",
    black: lightModeTextColor,
    red: lightModeTextColor,
    green: lightModeTextColor,
    yellow: lightModeTextColor,
    blue: lightModeTextColor,
    magenta: lightModeTextColor,
    cyan: lightModeTextColor,
    white: lightModeTextColor,
    brightBlack: lightModeTextColor,
    brightRed: lightModeTextColor,
    brightGreen: lightModeTextColor,
    brightYellow: lightModeTextColor,
    brightBlue: lightModeTextColor,
    brightMagenta: lightModeTextColor,
    brightCyan: lightModeTextColor,
    brightWhite: "#ffffff",
  };
}

function createTerminalTabLabel(tabIndex: number) {
  return tabIndex === 1 ? "Terminal" : `Terminal ${tabIndex}`;
}

export function WorkspaceTerminalPanel({
  isOpen,
  onClose,
  onHeightCommit,
  resolvedTheme,
  storedHeight,
  workspaceKey,
  workspacePath,
}: WorkspaceTerminalPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalInputDisposableRef = useRef<IDisposable | null>(null);
  const terminalResizeDisposableRef = useRef<IDisposable | null>(null);
  const workspacePathRef = useRef<string | null>(workspacePath);
  const resizeStateRef = useRef<{
    pointerId: number;
    startHeight: number;
    startY: number;
  } | null>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const pendingResizeHeightRef = useRef<number | null>(null);
  const lastSyncedSizeRef = useRef<{
    cols: number;
    rows: number;
    sessionId: number;
  } | null>(null);
  const isResizingRef = useRef(false);
  const terminalWorkspaceStateRef = useRef<Record<string, TerminalWorkspaceState>>({});
  const previousWorkspaceKeyRef = useRef(workspaceKey);
  const terminalTabsRef = useRef<TerminalTabState[]>([]);
  const nextTabIndexRef = useRef(1);
  const activeTabKeyRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<number | null>(null);
  const sessionIdToTabKeyRef = useRef<Map<number, string>>(new Map());
  const tabBuffersRef = useRef<Map<string, string>>(new Map());
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabState[]>([]);
  const [activeTerminalTabKey, setActiveTerminalTabKey] = useState<
    string | null
  >(null);
  const [isResizing, setIsResizing] = useState(false);
  const [panelHeight, setPanelHeight] = useState(() =>
    clampStoredTerminalPanelHeight(storedHeight),
  );

  const activeTerminalTab = useMemo(
    () => terminalTabs.find((tab) => tab.key === activeTerminalTabKey) ?? null,
    [activeTerminalTabKey, terminalTabs],
  );

  useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  useEffect(() => {
    workspacePathRef.current = workspacePath;
  }, [workspacePath]);

  useEffect(() => {
    isResizingRef.current = isResizing;
  }, [isResizing]);

  useEffect(() => {
    activeTabKeyRef.current = activeTerminalTabKey;
    activeSessionIdRef.current = activeTerminalTab?.sessionId ?? null;
  }, [activeTerminalTab, activeTerminalTabKey]);

  const panelHeightRef = useRef(panelHeight);
  useEffect(() => {
    panelHeightRef.current = panelHeight;
  }, [panelHeight]);

  const getMaxPanelHeight = useCallback(() => {
    const activePanelElement = panelRef.current;
    const parentHeight = activePanelElement?.parentElement?.clientHeight;
    if (!parentHeight) {
      return MAX_TERMINAL_PANEL_HEIGHT;
    }

    return Math.min(MAX_TERMINAL_PANEL_HEIGHT, Math.floor(parentHeight * 0.78));
  }, []);

  const sendTerminalSizeToSession = useCallback(
    (dimensions: { cols: number; rows: number }) => {
      const activeSessionId = activeSessionIdRef.current;
      if (activeSessionId === null) {
        return;
      }

      const lastSyncedSize = lastSyncedSizeRef.current;
      if (
        lastSyncedSize &&
        lastSyncedSize.sessionId === activeSessionId &&
        lastSyncedSize.cols === dimensions.cols &&
        lastSyncedSize.rows === dimensions.rows
      ) {
        return;
      }

      lastSyncedSizeRef.current = {
        cols: dimensions.cols,
        rows: dimensions.rows,
        sessionId: activeSessionId,
      };

      void window.echosphereTerminal
        .resizeSession({
          cols: dimensions.cols,
          rows: dimensions.rows,
          sessionId: activeSessionId,
        })
        .catch((error) => {
          lastSyncedSizeRef.current = null;
          console.error("Failed to sync terminal size", error);
        });
    },
    [],
  );

  const syncTerminalSize = useCallback(
    (force = false) => {
      if (!force && isResizingRef.current) {
        return;
      }

      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      if (!terminal || !fitAddon) {
        return;
      }

      fitAddon.fit();
      sendTerminalSizeToSession(getSessionDimensions(terminal));
    },
    [sendTerminalSizeToSession],
  );

  const syncTerminalTheme = useCallback(() => {
    const hostElement = terminalHostRef.current;
    const terminal = terminalRef.current;
    if (!hostElement || !terminal) {
      return;
    }

    terminal.options.theme = {
      ...getTerminalTheme(hostElement, resolvedTheme),
    };
    terminal.refresh(0, Math.max(terminal.rows - 1, 0));
  }, [resolvedTheme]);

  const renderActiveTerminalTab = useCallback(
    (nextTabKey: string | null, sessionIdOverride?: number | null) => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      const nextTab = nextTabKey
        ? (terminalTabsRef.current.find((tab) => tab.key === nextTabKey) ??
          null)
        : null;
      activeTabKeyRef.current = nextTabKey;
      activeSessionIdRef.current =
        sessionIdOverride ?? nextTab?.sessionId ?? null;
      lastSyncedSizeRef.current = null;
      terminal.reset();

      if (!nextTabKey) {
        terminal.focus();
        return;
      }

      const bufferedOutput = tabBuffersRef.current.get(nextTabKey) ?? "";
      if (bufferedOutput.length > 0) {
        terminal.write(bufferedOutput);
      }

      if (nextTab?.status === "error" && nextTab.errorMessage) {
        terminal.writeln(
          `\r\n\r\nFailed to start terminal: ${nextTab.errorMessage}`,
        );
      }

      if (nextTab?.status === "exited" && nextTab.exitCode !== null) {
        terminal.writeln(
          `\r\n\r\nProcess exited with code ${nextTab.exitCode}.`,
        );
      }

      terminal.focus();
      syncTerminalSize(true);
    },
    [syncTerminalSize],
  );

  useEffect(() => {
    const nextWorkspaceKey = workspaceKey;
    const previousWorkspaceKey = previousWorkspaceKeyRef.current;
    if (previousWorkspaceKey === nextWorkspaceKey) {
      return;
    }

    terminalWorkspaceStateRef.current[previousWorkspaceKey] = {
      activeTerminalTabKey,
      nextTabIndex: nextTabIndexRef.current,
      terminalTabs,
    };

    const nextWorkspaceState =
      terminalWorkspaceStateRef.current[nextWorkspaceKey] ?? {
        activeTerminalTabKey: null,
        nextTabIndex: 1,
        terminalTabs: [],
      };

    if (nextWorkspaceState.terminalTabs.length === 0) {
      previousWorkspaceKeyRef.current = nextWorkspaceKey;
      setTerminalTabs([]);
      setActiveTerminalTabKey(null);
      nextTabIndexRef.current = 1;
      terminalTabsRef.current = [];
      activeTabKeyRef.current = null;
      activeSessionIdRef.current = null;
      lastSyncedSizeRef.current = null;
      terminalRef.current?.reset();
      onClose();
      return;
    }

    previousWorkspaceKeyRef.current = nextWorkspaceKey;
    setTerminalTabs(nextWorkspaceState.terminalTabs);
    setActiveTerminalTabKey(nextWorkspaceState.activeTerminalTabKey);
    nextTabIndexRef.current = nextWorkspaceState.nextTabIndex;
    terminalTabsRef.current = nextWorkspaceState.terminalTabs;
    activeTabKeyRef.current = nextWorkspaceState.activeTerminalTabKey;
    activeSessionIdRef.current =
      nextWorkspaceState.terminalTabs.find(
        (tab) => tab.key === nextWorkspaceState.activeTerminalTabKey,
      )?.sessionId ?? null;
    lastSyncedSizeRef.current = null;
    terminalRef.current?.reset();

    const nextActiveTab =
      nextWorkspaceState.activeTerminalTabKey
        ? nextWorkspaceState.terminalTabs.find(
            (tab) => tab.key === nextWorkspaceState.activeTerminalTabKey,
          ) ?? null
        : null;
    if (nextActiveTab) {
      renderActiveTerminalTab(nextActiveTab.key, nextActiveTab.sessionId);
    } else if (isOpen) {
      terminalRef.current?.focus();
    }
  }, [activeTerminalTabKey, isOpen, renderActiveTerminalTab, terminalTabs, workspaceKey]);

  const ensureTerminal = useCallback(() => {
    const hostElement = terminalHostRef.current;
    if (!hostElement || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.24,
      minimumContrastRatio: 4.5,
      scrollback: 5_000,
      theme: getTerminalTheme(hostElement, resolvedTheme),
    });
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      void window.echosphereTerminal
        .openExternalLink({ url: uri })
        .catch((error) => {
          console.error("Failed to open terminal link", error);
        });
    });

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(hostElement);
    terminal.focus();
    fitAddon.fit();
    terminal.attachCustomKeyEventHandler((event) => {
      const isCopyShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "c";
      if (!isCopyShortcut) {
        return true;
      }

      const copySelectedText = (text: string) => {
        void navigator.clipboard.writeText(text).catch((error) => {
          console.error("Failed to copy selected terminal text", error);
        });
      };

      const terminalSelection = terminal.getSelection();
      if (terminalSelection) {
        copySelectedText(terminalSelection);
        return false;
      }

      const nativeSelection = getNativeSelectionTextWithinHost(hostElement);
      if (nativeSelection) {
        copySelectedText(nativeSelection);
        return false;
      }

      return true;
    });

    terminalInputDisposableRef.current = terminal.onData((data) => {
      const activeSessionId = activeSessionIdRef.current;
      if (activeSessionId === null) {
        return;
      }

      void window.echosphereTerminal
        .writeToSession({
          data,
          sessionId: activeSessionId,
        })
        .catch((error) => {
          console.error("Failed to write terminal input", error);
        });
    });

    terminalResizeDisposableRef.current = terminal.onResize(() => {
      if (isResizingRef.current) {
        return;
      }

      sendTerminalSizeToSession(getSessionDimensions(terminal));
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
  }, [resolvedTheme, sendTerminalSizeToSession]);

  const disposeTerminal = useCallback(() => {
    terminalInputDisposableRef.current?.dispose();
    terminalResizeDisposableRef.current?.dispose();
    terminalInputDisposableRef.current = null;
    terminalResizeDisposableRef.current = null;
    fitAddonRef.current = null;
    terminalRef.current?.dispose();
    terminalRef.current = null;
  }, []);

  const openTerminalTab = useCallback(async () => {
    ensureTerminal();

    const tabIndex = nextTabIndexRef.current;
    nextTabIndexRef.current += 1;
    const tabKey = `terminal-tab-${tabIndex}`;
    const nextTab: TerminalTabState = {
      errorMessage: null,
      exitCode: null,
      key: tabKey,
      label: createTerminalTabLabel(tabIndex),
      sessionId: null,
      status: "connecting",
    };

    tabBuffersRef.current.set(tabKey, "");
    setTerminalTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveTerminalTabKey(tabKey);

    const terminal = terminalRef.current;
    const dimensions = terminal
      ? getSessionDimensions(terminal)
      : { cols: MIN_TERMINAL_COLS, rows: MIN_TERMINAL_ROWS };

    try {
      const session = await window.echosphereTerminal.createSession({
        cols: dimensions.cols,
        cwd: workspacePathRef.current,
        rows: dimensions.rows,
        sessionKey: tabKey,
      });

      sessionIdToTabKeyRef.current.set(session.sessionId, tabKey);
      tabBuffersRef.current.set(tabKey, session.bufferedOutput);

      setTerminalTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.key === tabKey
            ? {
                ...tab,
                errorMessage: null,
                exitCode: null,
                sessionId: session.sessionId,
                status: "ready",
              }
            : tab,
        ),
      );

      if (activeTabKeyRef.current === tabKey) {
        renderActiveTerminalTab(tabKey, session.sessionId);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setTerminalTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.key === tabKey
            ? {
                ...tab,
                errorMessage: message,
                sessionId: null,
                status: "error",
              }
            : tab,
        ),
      );

      if (activeTabKeyRef.current === tabKey && terminalRef.current) {
        terminalRef.current.reset();
        terminalRef.current.writeln(
          `\r\n\r\nFailed to start terminal: ${message}`,
        );
      }

      console.error("Failed to start terminal session", error);
    }
  }, [ensureTerminal, renderActiveTerminalTab]);

  const closeTerminalTab = useCallback(
    async (tabKey: string) => {
      const currentTabs = terminalTabsRef.current;
      const currentTabIndex = currentTabs.findIndex(
        (tab) => tab.key === tabKey,
      );
      if (currentTabIndex === -1) {
        return;
      }

      const currentTab = currentTabs[currentTabIndex];
      if (currentTab.sessionId !== null) {
        sessionIdToTabKeyRef.current.delete(currentTab.sessionId);
        void window.echosphereTerminal
          .closeSession({ sessionId: currentTab.sessionId })
          .catch((error) => {
            console.error("Failed to close terminal session", error);
          });
      }

      tabBuffersRef.current.delete(tabKey);
      const nextTabs = currentTabs.filter((tab) => tab.key !== tabKey);
      const wasActive = activeTabKeyRef.current === tabKey;

      setTerminalTabs(nextTabs);

      if (nextTabs.length === 0) {
        setActiveTerminalTabKey(null);
        activeTabKeyRef.current = null;
        activeSessionIdRef.current = null;
        lastSyncedSizeRef.current = null;
        onClose();
        return;
      }

      const nextActiveTab = wasActive
        ? (nextTabs[currentTabIndex] ??
          nextTabs[currentTabIndex - 1] ??
          nextTabs[0] ??
          null)
        : (nextTabs.find((tab) => tab.key === activeTabKeyRef.current) ??
          nextTabs[0] ??
          null);

      if (!nextActiveTab) {
        return;
      }

      setActiveTerminalTabKey(nextActiveTab.key);
      renderActiveTerminalTab(nextActiveTab.key, nextActiveTab.sessionId);
    },
    [onClose, renderActiveTerminalTab],
  );

  const selectTerminalTab = useCallback(
    (tabKey: string) => {
      if (activeTabKeyRef.current === tabKey) {
        return;
      }

      const nextTab =
        terminalTabsRef.current.find((tab) => tab.key === tabKey) ?? null;
      if (!nextTab) {
        return;
      }

      setActiveTerminalTabKey(tabKey);
      renderActiveTerminalTab(tabKey, nextTab.sessionId);
    },
    [renderActiveTerminalTab],
  );

  useEffect(() => {
    const unsubscribeData = window.echosphereTerminal.onData((event) => {
      const tabKey = sessionIdToTabKeyRef.current.get(event.sessionId);
      if (!tabKey) {
        return;
      }

      const currentBuffer = tabBuffersRef.current.get(tabKey) ?? "";
      tabBuffersRef.current.set(tabKey, currentBuffer + event.data);
      if (event.sessionId !== activeSessionIdRef.current) {
        return;
      }

      terminalRef.current?.write(event.data);
    });

    const unsubscribeExit = window.echosphereTerminal.onExit((event) => {
      const tabKey = sessionIdToTabKeyRef.current.get(event.sessionId);
      if (!tabKey) {
        return;
      }

      sessionIdToTabKeyRef.current.delete(event.sessionId);
      const nextExitMessage = `\r\n\r\nProcess exited with code ${event.exitCode}.`;
      tabBuffersRef.current.set(
        tabKey,
        `${tabBuffersRef.current.get(tabKey) ?? ""}${nextExitMessage}`,
      );

      setTerminalTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.key === tabKey
            ? {
                ...tab,
                exitCode: event.exitCode,
                sessionId: null,
                status: "exited",
              }
            : tab,
        ),
      );

      if (event.sessionId !== activeSessionIdRef.current) {
        return;
      }

      activeSessionIdRef.current = null;
      terminalRef.current?.writeln(nextExitMessage);
    });

    return () => {
      unsubscribeData();
      unsubscribeExit();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    ensureTerminal();
    if (terminalTabsRef.current.length === 0) {
      void openTerminalTab();
      return;
    }

    const fallbackTab = terminalTabsRef.current[0] ?? null;
    const nextActiveTab = activeTabKeyRef.current
      ? (terminalTabsRef.current.find(
          (tab) => tab.key === activeTabKeyRef.current,
        ) ?? fallbackTab)
      : fallbackTab;

    if (!nextActiveTab) {
      return;
    }

    setActiveTerminalTabKey(nextActiveTab.key);
    renderActiveTerminalTab(nextActiveTab.key, nextActiveTab.sessionId);
  }, [ensureTerminal, isOpen, openTerminalTab, renderActiveTerminalTab]);

  useEffect(() => {
    if (!terminalRef.current || !terminalHostRef.current) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      syncTerminalTheme();
    });
    const timeoutId = window.setTimeout(() => {
      syncTerminalTheme();
    }, TERMINAL_THEME_SYNC_DELAY_MS);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [resolvedTheme, syncTerminalTheme]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowResize = () => {
      const maxHeightLimit = getMaxPanelHeight();
      setPanelHeight((currentValue) =>
        clampPanelHeight(currentValue, maxHeightLimit),
      );
      syncTerminalSize();
    };

    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [getMaxPanelHeight, isOpen, syncTerminalSize]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const maxHeightLimit = getMaxPanelHeight();
    setPanelHeight((currentValue) =>
      clampPanelHeight(currentValue, maxHeightLimit),
    );
  }, [getMaxPanelHeight, isOpen]);

  useEffect(() => {
    if (isResizing) {
      return;
    }

    const maxHeightLimit = getMaxPanelHeight();
    setPanelHeight(clampPanelHeight(storedHeight, maxHeightLimit));
  }, [getMaxPanelHeight, isResizing, storedHeight]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (isResizing) {
      return;
    }

    syncTerminalSize();
  }, [isOpen, isResizing, panelHeight, syncTerminalSize]);

  useEffect(() => {
    if (!isOpen || isResizing) {
      return;
    }

    syncTerminalSize(true);
  }, [isOpen, isResizing, syncTerminalSize]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const hostElement = terminalHostRef.current;
    if (!hostElement) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncTerminalSize();
    });
    resizeObserver.observe(hostElement);
    return () => {
      resizeObserver.disconnect();
    };
  }, [isOpen, syncTerminalSize]);

  useEffect(() => {
    if (!isOpen || !isResizing || !resizeStateRef.current) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const maxHeightLimit = getMaxPanelHeight();
      const nextHeight = clampPanelHeight(
        resizeState.startHeight + (resizeState.startY - event.clientY),
        maxHeightLimit,
      );
      pendingResizeHeightRef.current = nextHeight;
      if (resizeAnimationFrameRef.current !== null) {
        return;
      }

      resizeAnimationFrameRef.current = window.requestAnimationFrame(() => {
        resizeAnimationFrameRef.current = null;
        const pendingHeight = pendingResizeHeightRef.current;
        if (pendingHeight === null) {
          return;
        }

        setPanelHeight(pendingHeight);
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (resizeStateRef.current?.pointerId !== event.pointerId) {
        return;
      }

      let committedHeight = panelHeightRef.current;
      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
        resizeAnimationFrameRef.current = null;
      }
      if (pendingResizeHeightRef.current !== null) {
        committedHeight = pendingResizeHeightRef.current;
        setPanelHeight(committedHeight);
      }
      pendingResizeHeightRef.current = null;

      resizeStateRef.current = null;
      isResizingRef.current = false;
      setIsResizing(false);
      onHeightCommit(committedHeight);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
        resizeAnimationFrameRef.current = null;
      }
      pendingResizeHeightRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [getMaxPanelHeight, isOpen, isResizing, onHeightCommit]);

  useEffect(() => {
    return () => {
      disposeTerminal();
    };
  }, [disposeTerminal]);

  const effectivePanelHeight = isOpen ? panelHeight : 0;

  return (
    <section
      ref={panelRef}
      className={[
        "relative flex min-h-0 w-full shrink-0 self-stretch flex-col overflow-hidden border-t border-border bg-[var(--workspace-panel-surface)]",
        isResizing
          ? ""
          : "transition-[height,border-color] duration-150 ease-out",
      ].join(" ")}
      style={{
        borderTopColor: isOpen ? "var(--color-border)" : "transparent",
        height: effectivePanelHeight,
      }}
      onTransitionEnd={(event) => {
        if (event.propertyName === "height") {
          syncTerminalSize();
        }
      }}
    >
      <button
        type="button"
        aria-label="Resize terminal panel"
        onPointerDown={(event) => {
          if (!isOpen || event.button !== 0) {
            return;
          }

          resizeStateRef.current = {
            pointerId: event.pointerId,
            startHeight: panelHeight,
            startY: event.clientY,
          };
          setIsResizing(true);
          document.body.style.cursor = "row-resize";
          document.body.style.userSelect = "none";
          event.preventDefault();
        }}
        className={[
          "absolute left-0 right-0 top-0 z-20 h-2",
          isOpen ? "cursor-row-resize" : "cursor-default",
        ].join(" ")}
      />
      <div className="flex h-10 shrink-0 items-stretch border-b border-border bg-background">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          <div className="workspace-tabs-scroll-viewport flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto overflow-y-hidden">
            {terminalTabs.map((tab) => {
              const isActive = tab.key === activeTerminalTabKey;
              return (
                <div
                  key={tab.key}
                  className="group relative inline-flex h-full shrink-0 items-stretch border-r border-border"
                >
                  <button
                    type="button"
                    onClick={() => selectTerminalTab(tab.key)}
                    className={[
                      "inline-flex h-full max-w-[248px] items-center gap-2 px-3 pr-9 text-sm transition-colors",
                      isActive
                        ? "border-t-2 border-t-foreground/60 bg-background text-foreground"
                        : "border-t-2 border-t-transparent bg-background text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                    ].join(" ")}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="truncate">{tab.label}</span>
                    {tab.status === "connecting" ? (
                      <LoaderCircle
                        size={12}
                        className="shrink-0 animate-spin"
                      />
                    ) : null}
                  </button>
                  <Tooltip content={`Close ${tab.label}`} side="bottom" noWrap>
                    <button
                      type="button"
                      onClick={() => {
                        void closeTerminalTab(tab.key);
                      }}
                      className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Close ${tab.label}`}
                    >
                      <X size={14} />
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 border-l border-border px-2">
          <Tooltip content="New terminal tab" side="bottom" noWrap>
            <button
              type="button"
              onClick={() => {
                void openTerminalTab();
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:rounded-xl hover:bg-surface-muted hover:text-foreground"
              aria-label="New terminal tab"
            >
              <Plus size={14} />
            </button>
          </Tooltip>
          <Tooltip content="Close terminal panel" side="bottom" noWrap>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:rounded-xl hover:bg-surface-muted hover:text-foreground"
              aria-label="Close terminal panel"
            >
              <X size={14} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div
        ref={terminalHostRef}
        className="workspace-terminal-host min-h-0 flex-1 overflow-hidden bg-[var(--workspace-panel-surface)] px-4 py-3 text-foreground"
      />
      {activeTerminalTab?.status === "error" &&
      activeTerminalTab.errorMessage ? (
        <div className="border-t border-danger-border bg-danger-surface px-4 py-1.5 text-xs text-danger-foreground">
          {activeTerminalTab.errorMessage}
        </div>
      ) : null}
      {activeTerminalTab?.status === "exited" &&
      activeTerminalTab.exitCode !== null ? (
        <div className="border-t border-border bg-surface-muted px-4 py-1.5 text-xs text-muted-foreground">
          Process exited with code {activeTerminalTab.exitCode}
        </div>
      ) : null}
    </section>
  );
}
