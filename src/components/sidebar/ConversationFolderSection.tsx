import { ChevronDown, ChevronRight, Folder, FolderOpen, SquarePen } from 'lucide-react'
import type { ConversationGroupPreview } from '../../types/chat'
import { Tooltip } from '../Tooltip'
import { ConversationHistoryItem } from './ConversationHistoryItem'

interface ConversationFolderSectionProps {
  group: ConversationGroupPreview
  isCollapsed: boolean
  onCreateConversation: (folderId?: string | null) => void
  onDeleteConversation: (conversationId: string) => void
  onSelectFolder: (folderId: string | null) => void
  onSelectConversation: (conversationId: string) => void
  onToggleCollapsed: () => void
}

export function ConversationFolderSection({
  group,
  isCollapsed,
  onCreateConversation,
  onToggleCollapsed,
  onSelectFolder,
  onSelectConversation,
  onDeleteConversation,
}: ConversationFolderSectionProps) {
  const FolderIcon = group.folder.isSelected ? FolderOpen : Folder

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Tooltip content={isCollapsed ? `Expand ${group.folder.name}` : `Collapse ${group.folder.name}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-subtle-foreground transition-colors hover:bg-[var(--sidebar-hover-surface)] hover:text-foreground"
            aria-label={isCollapsed ? `Expand ${group.folder.name}` : `Collapse ${group.folder.name}`}
          >
            {isCollapsed ? (
              <ChevronRight size={16} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={16} strokeWidth={2.2} />
            )}
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={() => onSelectFolder(group.folder.id)}
          className={[
            'flex h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border px-3 text-left transition-colors',
            group.folder.isSelected
              ? 'border-border bg-[var(--sidebar-raised-surface)] shadow-sm'
              : 'border-transparent bg-[var(--sidebar-muted-surface-mix)] hover:border-border/60 hover:bg-[var(--sidebar-hover-surface)]',
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FolderIcon
              size={16}
              strokeWidth={2.1}
              className={group.folder.isSelected ? 'shrink-0 text-foreground' : 'shrink-0 text-muted-foreground'}
            />
            <span
              className={[
                'truncate text-sm',
                group.folder.isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground',
              ].join(' ')}
            >
              {group.folder.name}
            </span>
          </span>
          <span
            className={[
              'inline-flex shrink-0 items-center justify-center text-[11px] font-medium tabular-nums text-subtle-foreground transition-colors',
              group.folder.isSelected ? 'text-muted-foreground' : 'text-subtle-foreground',
            ].join(' ')}
          >
            {group.folder.conversationCount}
          </span>
        </button>
        <Tooltip content={`Start new thread in ${group.folder.name}`} side="right">
          <button
            type="button"
            onClick={() => onCreateConversation(group.folder.id)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 ease-out hover:scale-110 hover:text-foreground"
            aria-label={`Start new thread in ${group.folder.name}`}
          >
            <SquarePen size={16} strokeWidth={2.1} />
          </button>
        </Tooltip>
      </div>

      <div
        className={[
          'grid transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out',
          isCollapsed ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-0.5 grid-rows-[1fr] opacity-100',
        ].join(' ')}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 px-1 pb-0.5 pl-10 pr-10 pt-0.5">
            {group.conversations.length === 0 ? (
              <div className="w-full px-4 py-1.5">
                <p className="text-xs text-subtle-foreground">No threads in this folder yet.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {group.conversations.map((conversation) => (
                  <ConversationHistoryItem
                    key={conversation.id}
                    conversation={conversation}
                    onSelectConversation={onSelectConversation}
                    onDeleteConversation={onDeleteConversation}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
