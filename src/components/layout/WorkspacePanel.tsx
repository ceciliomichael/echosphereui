import type { ReactNode } from 'react'

interface WorkspacePanelProps {
  isSidebarOpen: boolean
  showRightBorder?: boolean
  children: ReactNode
}

export function WorkspacePanel({
  isSidebarOpen,
  showRightBorder = true,
  children,
}: WorkspacePanelProps) {
  return (
    <main
      className={[
        'flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-[var(--workspace-panel-surface)] shadow-soft transition-[border-radius] duration-300 ease-out',
        showRightBorder ? '' : 'border-r-0',
        isSidebarOpen ? 'rounded-l-[28px] rounded-r-none' : 'rounded-none',
        'm-0',
      ].join(' ')}
    >
      {children}
    </main>
  )
}
