import type { ReactNode } from 'react'
import { ResizableSidebarPanel } from '../sidebar/ResizableSidebarPanel'

interface AppWorkspaceShellProps {
  isSidebarOpen: boolean
  sidebar: ReactNode
  children: ReactNode
}

export function AppWorkspaceShell({ isSidebarOpen, sidebar, children }: AppWorkspaceShellProps) {
  return (
    <div
      className="relative flex h-screen overflow-hidden bg-background"
      style={{ paddingTop: 'env(titlebar-area-height, 0px)' }}
    >
      <div
        className="app-drag-region pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center px-3 text-sm font-medium text-foreground/75"
        style={{ height: 'env(titlebar-area-height, 0px)' }}
      >
        <span className="select-none">EchoSphere</span>
      </div>

      <ResizableSidebarPanel isSidebarOpen={isSidebarOpen} sidebar={sidebar}>
        {children}
      </ResizableSidebarPanel>
    </div>
  )
}
