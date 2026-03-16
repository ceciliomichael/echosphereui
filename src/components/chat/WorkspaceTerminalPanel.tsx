import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import type { IDisposable, ITerminalOptions } from '@xterm/xterm'
import {
  MAX_TERMINAL_PANEL_HEIGHT,
  MIN_TERMINAL_PANEL_HEIGHT,
  clampStoredTerminalPanelHeight,
} from '../../lib/terminalPanelSizing'
import type { ResolvedTheme } from '../../lib/theme'
import { Tooltip } from '../Tooltip'
import '@xterm/xterm/css/xterm.css'

const MIN_TERMINAL_COLS = 20
const MIN_TERMINAL_ROWS = 6
const TERMINAL_THEME_SYNC_DELAY_MS = 200

type TerminalTheme = NonNullable<ITerminalOptions['theme']>

interface WorkspaceTerminalPanelProps {
  isOpen: boolean
  onClose: () => void
  onHeightCommit: (nextHeight: number) => void
  resolvedTheme: ResolvedTheme
  storedHeight: number
  workspacePath: string | null
}

function clampPanelHeight(nextHeight: number, maxHeightLimit: number) {
  const safeMaxHeight = Math.max(MIN_TERMINAL_PANEL_HEIGHT, maxHeightLimit)
  return Math.max(MIN_TERMINAL_PANEL_HEIGHT, Math.min(nextHeight, safeMaxHeight))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Failed to process terminal action.'
}

function getSessionDimensions(terminal: Terminal) {
  return {
    cols: Math.max(MIN_TERMINAL_COLS, terminal.cols || 80),
    rows: Math.max(MIN_TERMINAL_ROWS, terminal.rows || 24),
  }
}

function getNativeSelectionTextWithinHost(hostElement: HTMLElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return ''
  }

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  if (!anchorNode || !focusNode) {
    return ''
  }

  const isAnchorInsideHost = hostElement.contains(anchorNode)
  const isFocusInsideHost = hostElement.contains(focusNode)
  if (!isAnchorInsideHost && !isFocusInsideHost) {
    return ''
  }

  return selection.toString()
}

function getTerminalTheme(hostElement: HTMLElement, resolvedTheme: ResolvedTheme): TerminalTheme {
  const hostStyles = window.getComputedStyle(hostElement)
  const foreground = hostStyles.color
  const background = hostStyles.backgroundColor
  const lightModeTextColor = '#101011'

  if (resolvedTheme === 'dark') {
    return {
      background,
      foreground,
      cursor: foreground,
      selectionBackground: 'rgb(135 113 255 / 0.34)',
      selectionInactiveBackground: 'rgb(135 113 255 / 0.22)',
      black: '#1f1f21',
      red: '#f48771',
      green: '#9ad792',
      yellow: '#f5d76e',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#d9d9da',
      brightBlack: '#7d7d83',
      brightRed: '#ffb3a7',
      brightGreen: '#b8e8ae',
      brightYellow: '#f8e194',
      brightBlue: '#a6bcff',
      brightMagenta: '#d8c1ff',
      brightCyan: '#9be6ff',
      brightWhite: '#ffffff',
    }
  }

  return {
    background,
    foreground: lightModeTextColor,
    cursor: lightModeTextColor,
    selectionBackground: 'rgb(59 130 246 / 0.30)',
    selectionInactiveBackground: 'rgb(59 130 246 / 0.20)',
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
    brightWhite: '#ffffff',
  }
}

export function WorkspaceTerminalPanel({
  isOpen,
  onClose,
  onHeightCommit,
  resolvedTheme,
  storedHeight,
  workspacePath,
}: WorkspaceTerminalPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const terminalHostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const terminalInputDisposableRef = useRef<IDisposable | null>(null)
  const terminalResizeDisposableRef = useRef<IDisposable | null>(null)
  const sessionIdRef = useRef<number | null>(null)
  const workspacePathRef = useRef<string | null>(workspacePath)
  const resizeStateRef = useRef<{ pointerId: number; startHeight: number; startY: number } | null>(null)
  const lastSyncedSizeRef = useRef<{ cols: number; rows: number; sessionId: number } | null>(null)
  const isResizingRef = useRef(false)
  const [shellLabel, setShellLabel] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [panelHeight, setPanelHeight] = useState(() => clampStoredTerminalPanelHeight(storedHeight))
  const [cwdLabel, setCwdLabel] = useState<string | null>(null)

  useEffect(() => {
    workspacePathRef.current = workspacePath
  }, [workspacePath])

  useEffect(() => {
    isResizingRef.current = isResizing
  }, [isResizing])

  const panelHeightRef = useRef(panelHeight)
  useEffect(() => {
    panelHeightRef.current = panelHeight
  }, [panelHeight])

  const getMaxPanelHeight = useCallback(() => {
    const activePanelElement = panelRef.current
    const parentHeight = activePanelElement?.parentElement?.clientHeight
    if (!parentHeight) {
      return MAX_TERMINAL_PANEL_HEIGHT
    }

    return Math.min(MAX_TERMINAL_PANEL_HEIGHT, Math.floor(parentHeight * 0.78))
  }, [])

  const sendTerminalSizeToSession = useCallback((dimensions: { cols: number; rows: number }) => {
    const activeSessionId = sessionIdRef.current
    if (activeSessionId === null) {
      return
    }

    const lastSyncedSize = lastSyncedSizeRef.current
    if (
      lastSyncedSize &&
      lastSyncedSize.sessionId === activeSessionId &&
      lastSyncedSize.cols === dimensions.cols &&
      lastSyncedSize.rows === dimensions.rows
    ) {
      return
    }

    lastSyncedSizeRef.current = {
      cols: dimensions.cols,
      rows: dimensions.rows,
      sessionId: activeSessionId,
    }

    void window.echosphereTerminal
      .resizeSession({
        cols: dimensions.cols,
        rows: dimensions.rows,
        sessionId: activeSessionId,
      })
      .catch((error) => {
        lastSyncedSizeRef.current = null
        console.error('Failed to sync terminal size', error)
      })
  }, [])

  const syncTerminalSize = useCallback((force = false) => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) {
      return
    }

    fitAddon.fit()
    if (!force && isResizingRef.current) {
      return
    }

    const dimensions = getSessionDimensions(terminal)
    sendTerminalSizeToSession(dimensions)
  }, [sendTerminalSizeToSession])

  const syncTerminalTheme = useCallback(() => {
    const hostElement = terminalHostRef.current
    const terminal = terminalRef.current
    if (!hostElement || !terminal) {
      return
    }

    terminal.options.theme = { ...getTerminalTheme(hostElement, resolvedTheme) }
    terminal.refresh(0, Math.max(terminal.rows - 1, 0))
  }, [resolvedTheme])

  const ensureTerminal = useCallback(() => {
    const hostElement = terminalHostRef.current
    if (!hostElement || terminalRef.current) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.24,
      minimumContrastRatio: 4.5,
      scrollback: 5_000,
      theme: getTerminalTheme(hostElement, resolvedTheme),
    })
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      event.preventDefault()
      void window.echosphereTerminal.openExternalLink({ url: uri }).catch((error) => {
        console.error('Failed to open terminal link', error)
      })
    })
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(hostElement)
    terminal.focus()
    fitAddon.fit()
    terminal.attachCustomKeyEventHandler((event) => {
      const isCopyShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'c'
      if (!isCopyShortcut) {
        return true
      }

      const copySelectedText = (text: string) => {
        void navigator.clipboard.writeText(text).catch((error) => {
          console.error('Failed to copy selected terminal text', error)
        })
      }

      const terminalSelection = terminal.getSelection()
      if (terminalSelection) {
        copySelectedText(terminalSelection)
        return false
      }

      const nativeSelection = getNativeSelectionTextWithinHost(hostElement)
      if (nativeSelection) {
        copySelectedText(nativeSelection)
        return false
      }

      return true
    })

    terminalInputDisposableRef.current = terminal.onData((data) => {
      const activeSessionId = sessionIdRef.current
      if (activeSessionId === null) {
        return
      }

      void window.echosphereTerminal.writeToSession({
        data,
        sessionId: activeSessionId,
      })
    })
    terminalResizeDisposableRef.current = terminal.onResize(() => {
      if (isResizingRef.current) {
        return
      }

      sendTerminalSizeToSession(getSessionDimensions(terminal))
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
  }, [resolvedTheme, sendTerminalSizeToSession])

  const disposeTerminal = useCallback(() => {
    terminalInputDisposableRef.current?.dispose()
    terminalResizeDisposableRef.current?.dispose()
    terminalInputDisposableRef.current = null
    terminalResizeDisposableRef.current = null
    fitAddonRef.current = null
    terminalRef.current?.dispose()
    terminalRef.current = null
  }, [])

  const attachWorkspaceSession = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) {
      return
    }

    setIsConnecting(true)
    setErrorMessage(null)
    setExitCode(null)
    fitAddon.fit()
    terminal.focus()

    const dimensions = getSessionDimensions(terminal)
    void window.echosphereTerminal
      .createSession({
        cols: dimensions.cols,
        cwd: workspacePathRef.current,
        rows: dimensions.rows,
      })
      .then((session) => {
        const previousSessionId = sessionIdRef.current
        sessionIdRef.current = session.sessionId
        lastSyncedSizeRef.current = null
        setShellLabel(session.shell)
        setCwdLabel(session.cwd)
        setIsConnecting(false)

        if (previousSessionId !== session.sessionId) {
          terminal.reset()
          if (session.bufferedOutput.length > 0) {
            terminal.write(session.bufferedOutput)
          }
        }

        syncTerminalSize(true)
      })
      .catch((error) => {
        const message = getErrorMessage(error)
        setIsConnecting(false)
        setErrorMessage(message)
        terminal.writeln(`\r\n\nFailed to start terminal: ${message}`)
      })
  }, [syncTerminalSize])

  useEffect(() => {
    const unsubscribeData = window.echosphereTerminal.onData((event) => {
      if (event.sessionId !== sessionIdRef.current) {
        return
      }

      terminalRef.current?.write(event.data)
    })
    const unsubscribeExit = window.echosphereTerminal.onExit((event) => {
      if (event.sessionId !== sessionIdRef.current) {
        return
      }

      sessionIdRef.current = null
      lastSyncedSizeRef.current = null
      setIsConnecting(false)
      setExitCode(event.exitCode)
      terminalRef.current?.writeln(`\r\n\nProcess exited with code ${event.exitCode}.`)
    })

    return () => {
      unsubscribeData()
      unsubscribeExit()
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    ensureTerminal()
    attachWorkspaceSession()
  }, [attachWorkspaceSession, ensureTerminal, isOpen, workspacePath])

  useEffect(() => {
    if (!terminalRef.current || !terminalHostRef.current) {
      return
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      syncTerminalTheme()
    })
    const timeoutId = window.setTimeout(() => {
      syncTerminalTheme()
    }, TERMINAL_THEME_SYNC_DELAY_MS)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
      window.clearTimeout(timeoutId)
    }
  }, [resolvedTheme, syncTerminalTheme])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleWindowResize = () => {
      const maxHeightLimit = getMaxPanelHeight()
      setPanelHeight((currentValue) => clampPanelHeight(currentValue, maxHeightLimit))
      syncTerminalSize()
    }

    window.addEventListener('resize', handleWindowResize)
    return () => {
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [getMaxPanelHeight, isOpen, syncTerminalSize])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const maxHeightLimit = getMaxPanelHeight()
    setPanelHeight((currentValue) => clampPanelHeight(currentValue, maxHeightLimit))
  }, [getMaxPanelHeight, isOpen])

  useEffect(() => {
    if (isResizing) {
      return
    }

    const maxHeightLimit = getMaxPanelHeight()
    setPanelHeight(clampPanelHeight(storedHeight, maxHeightLimit))
  }, [getMaxPanelHeight, isResizing, storedHeight])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    syncTerminalSize()
  }, [isOpen, panelHeight, syncTerminalSize])

  useEffect(() => {
    if (!isOpen || isResizing) {
      return
    }

    syncTerminalSize(true)
  }, [isOpen, isResizing, syncTerminalSize])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const hostElement = terminalHostRef.current
    if (!hostElement) {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      syncTerminalSize()
    })
    resizeObserver.observe(hostElement)
    return () => {
      resizeObserver.disconnect()
    }
  }, [isOpen, syncTerminalSize])

  useEffect(() => {
    if (!isOpen || !isResizing || !resizeStateRef.current) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState) {
        return
      }

      const maxHeightLimit = getMaxPanelHeight()
      const nextHeight = clampPanelHeight(resizeState.startHeight + (resizeState.startY - event.clientY), maxHeightLimit)
      setPanelHeight(nextHeight)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (resizeStateRef.current?.pointerId !== event.pointerId) {
        return
      }

      resizeStateRef.current = null
      setIsResizing(false)
      onHeightCommit(panelHeightRef.current)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [getMaxPanelHeight, isOpen, isResizing, onHeightCommit])

  useEffect(() => {
    return () => {
      disposeTerminal()
    }
  }, [disposeTerminal])

  const effectivePanelHeight = isOpen ? panelHeight : 0
  const headerIconButtonClassName =
    'inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent'

  return (
    <section
      ref={panelRef}
      className={[
        'relative flex min-h-0 w-full shrink-0 self-stretch flex-col overflow-hidden border-t border-border bg-[var(--workspace-panel-surface)]',
        isResizing ? '' : 'transition-[height,border-color] duration-150 ease-out',
      ].join(' ')}
      style={{
        borderTopColor: isOpen ? 'var(--color-border)' : 'transparent',
        height: effectivePanelHeight,
      }}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'height') {
          syncTerminalSize()
        }
      }}
    >
      <button
        type="button"
        aria-label="Resize terminal panel"
        onPointerDown={(event) => {
          if (!isOpen || event.button !== 0) {
            return
          }

          resizeStateRef.current = {
            pointerId: event.pointerId,
            startHeight: panelHeight,
            startY: event.clientY,
          }
          setIsResizing(true)
          document.body.style.cursor = 'row-resize'
          document.body.style.userSelect = 'none'
          event.preventDefault()
        }}
        className={[
          'absolute left-0 right-0 top-0 z-20 h-2',
          isOpen ? 'cursor-row-resize' : 'cursor-default',
        ].join(' ')}
      />
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-[var(--workspace-panel-surface)] px-6">
        <div className="flex min-w-0 items-center gap-2 text-base">
          <span className="font-semibold text-foreground">Terminal</span>
          <span className="truncate font-medium text-foreground">{shellLabel ?? 'Shell'}</span>
          {cwdLabel ? (
            <>
              <span className="h-4 w-px bg-border" />
              <span
                className="select-text truncate text-sm text-foreground selection:bg-[#101011]/70 selection:text-white"
                title={cwdLabel}
              >
                {cwdLabel}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {isConnecting ? <span className="pr-1 text-xs text-foreground">Starting...</span> : null}
          <Tooltip content="Close terminal" side="left" noWrap>
            <button
              type="button"
              onClick={onClose}
              className={headerIconButtonClassName}
              aria-label="Close terminal"
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
      {errorMessage ? (
        <div className="border-t border-danger-border bg-danger-surface px-4 py-1.5 text-xs text-danger-foreground">
          {errorMessage}
        </div>
      ) : null}
      {exitCode !== null ? (
        <div className="border-t border-border bg-surface-muted px-4 py-1.5 text-xs text-muted-foreground">
          Process exited with code {exitCode}
        </div>
      ) : null}
    </section>
  )
}
