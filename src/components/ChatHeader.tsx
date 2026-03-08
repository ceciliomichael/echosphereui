import { PanelLeft } from 'lucide-react'

interface ChatHeaderProps {
  title: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ChatHeader({ title, isSidebarOpen, onToggleSidebar }: ChatHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center px-4 md:px-5">
      <div className={['flex min-w-0 items-center', isSidebarOpen ? 'gap-3' : 'gap-5'].join(' ')}>
        {!isSidebarOpen ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
            aria-label="Open history"
            aria-pressed={false}
          >
            <PanelLeft size={18} strokeWidth={2.2} />
          </button>
        ) : null}

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
      </div>
    </header>
  )
}
