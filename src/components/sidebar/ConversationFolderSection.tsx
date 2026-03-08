import { ChevronDown, ChevronRight, Ellipsis, Folder, FolderOpen, SquarePen } from 'lucide-react'
import type { ConversationGroupPreview } from '../../types/chat'
import { Tooltip } from '../Tooltip'
import { ConversationHistoryItem } from './ConversationHistoryItem'

interface ConversationFolderSectionProps {
  group: ConversationGroupPreview
  isCollapsed: boolean
  onCreateConversation: (folderId?: string | null) => void
  onOpenFolderPath: (folderPath: string) => void
  onToggleCollapsed: () => void
  onSelectFolder: (folderId: string | null) => void
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
}

export function ConversationFolderSection({
  group,
  isCollapsed,
  onCreateConversation,
  onOpenFolderPath,
  onToggleCollapsed,
  onSelectFolder,
  onSelectConversation,
  onDeleteConversation,
}: ConversationFolderSectionProps) {
  const FolderIcon = group.folder.isSelected ? FolderOpen : Folder
  const isActionableFolder = group.folder.path !== null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Tooltip content={isCollapsed ? `Expand ${group.folder.name}` : `Collapse ${group.folder.name}`}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-subtle-foreground transition-colors hover:bg-sidebar-muted hover:text-foreground"
            aria-label={isCollapsed ? `Expand ${group.folder.name}` : `Collapse ${group.folder.name}`}
          >
            {isCollapsed ? (
              <ChevronRight size={16} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={16} strokeWidth={2.2} />
            )}
          </button>
        </Tooltip>
        <div
          className={[
            'group/folder-row flex h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border px-3 text-left transition-colors',
            group.folder.isSelected ? 'bg-surface shadow-sm' : 'hover:bg-sidebar-muted',
            group.folder.isSelected
              ? 'border-border'
              : 'border-transparent bg-background/45 hover:border-border/60',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => onSelectFolder(group.folder.id)}
            className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
          >
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
          </button>
          <div className="flex min-w-[4.75rem] shrink-0 items-center justify-end gap-1">
            {group.folder.isSelected ? (
              <>
                {isActionableFolder ? (
                  <Tooltip content="Open folder">
                    <button
                      type="button"
                      onClick={() => {
                        if (group.folder.path) {
                          onOpenFolderPath(group.folder.path)
                        }
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-muted hover:text-foreground"
                      aria-label={`Open ${group.folder.name} in explorer`}
                    >
                      <Ellipsis size={17} strokeWidth={2.2} />
                    </button>
                  </Tooltip>
                ) : null}
                <Tooltip content={`Start new thread in ${group.folder.name}`} side="right">
                  <button
                    type="button"
                    onClick={() => onCreateConversation(group.folder.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 ease-out hover:scale-110 hover:text-foreground"
                    aria-label={`Start new thread in ${group.folder.name}`}
                  >
                    <SquarePen size={16} strokeWidth={2.1} />
                  </button>
                </Tooltip>
              </>
            ) : (
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-medium tabular-nums text-subtle-foreground transition-opacity duration-200 ease-out group-hover/folder-row:opacity-0">
                  {group.folder.conversationCount}
                </span>
                <Tooltip content={`Start new thread in ${group.folder.name}`} side="right">
                  <button
                    type="button"
                    onClick={() => onCreateConversation(group.folder.id)}
                    className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all duration-200 ease-out hover:scale-110 hover:text-foreground group-hover/folder-row:pointer-events-auto group-hover/folder-row:opacity-100"
                    aria-label={`Start new thread in ${group.folder.name}`}
                  >
                    <SquarePen size={16} strokeWidth={2.1} />
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={[
          'grid transition-[grid-template-rows,opacity,margin-top] duration-200 ease-out',
          isCollapsed ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-0.5 grid-rows-[1fr] opacity-100',
        ].join(' ')}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 px-1 pb-1 pl-11 pt-1">
            {group.conversations.length === 0 ? (
              <p className="text-xs text-subtle-foreground">No threads in this folder yet.</p>
            ) : (
              <div className="space-y-2">
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
