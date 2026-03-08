import { FolderPlus, PanelLeft, Settings } from 'lucide-react'
import { Tooltip } from '../Tooltip'
import type { ConversationGroupPreview } from '../../types/chat'
import { ConversationHistoryList } from './ConversationHistoryList'

interface SidebarPanelProps {
  conversationGroups: ConversationGroupPreview[]
  onCreateFolder: () => Promise<void>
  onCreateConversation: (folderId?: string | null) => void
  onDeleteConversation: (conversationId: string) => void
  onOpenSettings: () => void
  onSelectConversation: (conversationId: string) => void
  onSelectFolder: (folderId: string | null) => void
  onToggleSidebar: () => void
}

export function SidebarPanel({
  conversationGroups,
  onCreateFolder,
  onCreateConversation,
  onDeleteConversation,
  onOpenSettings,
  onSelectConversation,
  onSelectFolder,
  onToggleSidebar,
}: SidebarPanelProps) {
  const actionButtonClassName =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-foreground shadow-sm transition-colors duration-200 ease-out hover:bg-sidebar-muted'
  const footerButtonClassName =
    'flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-sm font-medium text-foreground transition-colors duration-200 ease-out hover:bg-sidebar-muted'

  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col bg-background px-4 pb-5 pt-3 md:px-5">
      <div className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <Tooltip content="Collapse sidebar" side="right">
            <button
              type="button"
              onClick={onToggleSidebar}
              className={actionButtonClassName}
              aria-label="Collapse sidebar"
            >
              <PanelLeft size={18} strokeWidth={2.2} />
            </button>
          </Tooltip>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate whitespace-nowrap text-sm font-semibold text-foreground">Threads</p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content="Add folder" side="left">
              <button
                type="button"
                onClick={() => {
                  void onCreateFolder()
                }}
                className={actionButtonClassName}
                aria-label="Open folder picker"
              >
                <FolderPlus size={18} strokeWidth={2.2} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="scroll-stable mt-2 flex-1 overflow-y-auto pr-1">
        <ConversationHistoryList
          conversationGroups={conversationGroups}
          onCreateConversation={onCreateConversation}
          onDeleteConversation={onDeleteConversation}
          onSelectConversation={onSelectConversation}
          onSelectFolder={onSelectFolder}
        />
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={onOpenSettings}
          className={footerButtonClassName}
          aria-label="Open settings"
        >
          <Settings size={18} strokeWidth={2.2} className="shrink-0 text-muted-foreground" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}


