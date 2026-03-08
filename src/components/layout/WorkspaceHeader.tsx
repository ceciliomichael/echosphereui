import { PanelLeft } from 'lucide-react'
import { Tooltip } from '../Tooltip'

interface WorkspaceHeaderProps {
  title: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  openSidebarLabel: string
}

export function WorkspaceHeader({
  title,
  isSidebarOpen,
  onToggleSidebar,
  openSidebarLabel,
}: WorkspaceHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center px-4 md:px-5">
      <div className="flex min-w-0 items-center">
        <Tooltip content={openSidebarLabel} side="bottom">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={[
              'flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-muted-foreground transition-[width,margin-right,opacity,color,background-color] duration-200 ease-out hover:bg-surface-muted hover:text-foreground',
              isSidebarOpen ? 'pointer-events-none mr-0 w-0 opacity-0' : 'mr-3 w-10 opacity-100',
            ].join(' ')}
            aria-label={openSidebarLabel}
            aria-hidden={isSidebarOpen}
            aria-pressed={false}
            tabIndex={isSidebarOpen ? -1 : 0}
          >
            <PanelLeft size={18} strokeWidth={2.2} />
          </button>
        </Tooltip>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
      </div>
    </header>
  )
}
