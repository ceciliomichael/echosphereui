import { MessageSquarePlus, PanelLeft } from 'lucide-react'
import type { ConversationPreview } from '../../types/chat'
import { ConversationHistoryList } from './ConversationHistoryList'

interface SidebarPanelProps {
  conversations: ConversationPreview[]
  onDeleteConversation: (conversationId: string) => void
  onNewConversation: () => void
  onSelectConversation: (conversationId: string) => void
  onToggleSidebar: () => void
}

export function SidebarPanel({
  conversations,
  onDeleteConversation,
  onNewConversation,
  onSelectConversation,
  onToggleSidebar,
}: SidebarPanelProps) {
  return (
    <aside className="flex h-full min-w-0 flex-1 flex-col bg-background px-4 pb-5 pt-3 md:px-5">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-foreground shadow-sm transition-colors hover:bg-white"
            aria-label="Collapse sidebar"
          >
            <PanelLeft size={18} strokeWidth={2.2} />
          </button>
          <div className="min-w-0">
            <p className="truncate whitespace-nowrap text-sm font-semibold text-foreground">History</p>
            <p className="truncate whitespace-nowrap text-xs text-subtle-foreground">Recent conversations</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-foreground shadow-sm transition-colors hover:bg-white"
          aria-label="Create conversation"
        >
          <MessageSquarePlus size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="scroll-stable mt-2 flex-1 overflow-y-auto pr-1">
        <ConversationHistoryList
          conversations={conversations}
          onDeleteConversation={onDeleteConversation}
          onSelectConversation={onSelectConversation}
        />
      </div>
    </aside>
  )
}


