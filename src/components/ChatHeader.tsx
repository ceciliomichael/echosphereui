import { PanelLeft } from 'lucide-react'

interface ChatHeaderProps {
  title: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ChatHeader({ title, isSidebarOpen, onToggleSidebar }: ChatHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center px-4 md:px-5">
      <div className="flex min-w-0 items-center">
        <div
          className={[
            'shrink-0 overflow-hidden transition-[width,margin-right,opacity] duration-300 ease-out',
            isSidebarOpen ? 'mr-0 w-0 opacity-0' : 'mr-3 w-10 opacity-100',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={onToggleSidebar}
            className={[
              'flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-[transform,opacity,color,background-color] duration-300 ease-out hover:bg-surface-muted hover:text-foreground',
              isSidebarOpen ? '-translate-x-6 opacity-0' : 'translate-x-0 opacity-100',
            ].join(' ')}
            aria-label="Open history"
            aria-hidden={isSidebarOpen}
            aria-pressed={false}
            tabIndex={isSidebarOpen ? -1 : 0}
          >
            <PanelLeft size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div
          className={[
            'min-w-0 transition-transform duration-300 ease-out',
            isSidebarOpen ? 'translate-x-0' : 'translate-x-2',
          ].join(' ')}
        >
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
      </div>
    </header>
  )
}
