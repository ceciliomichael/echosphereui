import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { AppSettings } from '../../types/chat'
import {
  DEFAULT_SIDEBAR_WIDTH,
  getMaxSidebarWidth,
  MIN_SIDEBAR_WIDTH,
} from '../../lib/sidebarSizing'

interface ResizableSidebarPanelProps {
  isSidebarOpen: boolean
  sidebar: ReactNode
  children: ReactNode
}

export function ResizableSidebarPanel({ isSidebarOpen, sidebar, children }: ResizableSidebarPanelProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const dragStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH)
  const visibleSidebarWidth = isSidebarOpen ? sidebarWidth : 0
  const shouldRenderSidebarContent = isSidebarOpen

  function updateSidebarWidth(nextWidth: number) {
    sidebarWidthRef.current = nextWidth
    setSidebarWidth(nextWidth)
  }

  useEffect(() => {
    let isMounted = true

    async function loadStoredSidebarWidth() {
      try {
        const settings = await window.echosphereSettings.getSettings()
        if (!isMounted) {
          return
        }

        updateSidebarWidth(
          Math.min(Math.max(settings.sidebarWidth, MIN_SIDEBAR_WIDTH), getMaxSidebarWidth(window.innerWidth)),
        )
      } catch (error) {
        console.error('Failed to load sidebar settings', error)
      }
    }

    void loadStoredSidebarWidth()

    function handleWindowResize() {
      updateSidebarWidth(
        Math.min(
          Math.max(sidebarWidthRef.current, MIN_SIDEBAR_WIDTH),
          getMaxSidebarWidth(window.innerWidth),
        ),
      )
    }

    window.addEventListener('resize', handleWindowResize)
    return () => {
      isMounted = false
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current
      if (!dragState) return

      const nextWidth = dragState.startWidth + (event.clientX - dragState.startX)
      const clampedWidth = Math.min(
        Math.max(nextWidth, MIN_SIDEBAR_WIDTH),
        getMaxSidebarWidth(window.innerWidth),
      )
      updateSidebarWidth(clampedWidth)
    }

    function handlePointerUp(event: PointerEvent) {
      if (dragStateRef.current?.pointerId !== event.pointerId) return

      const finalWidth = sidebarWidthRef.current
      dragStateRef.current = null
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      void window.echosphereSettings.updateSettings({ sidebarWidth: finalWidth } satisfies Partial<AppSettings>)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidth,
    }

    setIsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      <div
        className={[
          'hidden h-full shrink-0 overflow-hidden lg:flex',
          isResizing ? '' : 'transition-[width,opacity] duration-300 ease-out',
          isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        style={{ width: `${visibleSidebarWidth}px` }}
        aria-hidden={!isSidebarOpen}
      >
        <div className="h-full min-w-0 flex-1" style={{ width: `${sidebarWidth}px` }}>
          {shouldRenderSidebarContent ? sidebar : null}
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1">
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handlePointerDown}
          className={[
            'absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize lg:block',
            isSidebarOpen ? '' : 'pointer-events-none opacity-0',
          ].join(' ')}
        />
        {children}
      </div>
    </div>
  )
}
