import type { ReactNode } from 'react'
import { ResizableSidebarPanel } from '../sidebar/ResizableSidebarPanel'

interface AppWorkspaceShellProps {
  isSidebarOpen: boolean
  onSidebarWidthChange: (sidebarWidth: number) => void
  sidebar: ReactNode
  sidebarWidth: number
  children: ReactNode
}

export function AppWorkspaceShell({
  isSidebarOpen,
  onSidebarWidthChange,
  sidebar,
  sidebarWidth,
  children,
}: AppWorkspaceShellProps) {
  return (
    <div
      className="relative flex h-screen overflow-hidden bg-[var(--workspace-shell-surface)]"
      style={{ paddingTop: 'env(titlebar-area-height, 0px)' }}
    >
      <div
        className="app-drag-region pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center bg-[var(--titlebar-surface)] px-3 text-sm font-medium text-foreground/75"
        style={{ height: 'env(titlebar-area-height, 0px)' }}
      >
        <span className="select-none">EchoSphere</span>
      </div>

      <ResizableSidebarPanel
        isSidebarOpen={isSidebarOpen}
        onSidebarWidthChange={onSidebarWidthChange}
        sidebar={sidebar}
        sidebarWidth={sidebarWidth}
      >
        {children}
      </ResizableSidebarPanel>
    </div>
  )
}
