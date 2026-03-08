import { Check, ChevronDown, ChevronRight, Ellipsis, Folder, FolderOpen, SquarePen, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Tooltip } from '../Tooltip'
import type { ConversationGroupPreview, ConversationPreview } from '../../types/chat'

interface ConversationHistoryListProps {
  conversationGroups: ConversationGroupPreview[]
  onCreateConversation: (folderId?: string | null) => void
  onOpenFolderPath: (folderPath: string) => void
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
  onSelectFolder: (folderId: string | null) => void
}

interface HistoryListItemProps {
  conversation: ConversationPreview
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
}

interface FolderSectionProps {
  group: ConversationGroupPreview
  isCollapsed: boolean
  onCreateConversation: (folderId?: string | null) => void
  onOpenFolderPath: (folderPath: string) => void
  onToggleCollapsed: () => void
  onSelectFolder: (folderId: string | null) => void
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
}

function HistoryListItem({
  conversation,
  onSelectConversation,
  onDeleteConversation,
}: HistoryListItemProps) {
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setIsDeleteConfirming(false)
  }, [conversation.id])

  useEffect(() => {
    if (!isDeleteConfirming) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const targetNode = event.target as Node | null
      if (!targetNode) {
        return
      }

      if (deleteButtonRef.current?.contains(targetNode)) {
        return
      }

      setIsDeleteConfirming(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isDeleteConfirming])

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    if (isDeleteConfirming) {
      onDeleteConversation(conversation.id)
      return
    }

    setIsDeleteConfirming(true)
  }

  return (
    <div
      className={[
        'group flex items-center gap-2 rounded-xl px-2 py-1 transition-colors',
        isDeleteConfirming
          ? 'bg-red-50'
          : conversation.isActive
            ? 'bg-surface shadow-sm'
            : 'hover:bg-sidebar-muted/90',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelectConversation(conversation.id)}
        className={[
          'min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition-colors',
          conversation.isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
      >
        <span className="block truncate text-sm font-medium text-inherit">{conversation.title}</span>
      </button>

      <Tooltip content={isDeleteConfirming ? 'Click again to delete thread' : 'Delete thread'} side="right">
        <button
          ref={deleteButtonRef}
          type="button"
          onClick={handleDeleteClick}
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-out',
            isDeleteConfirming
              ? 'text-red-700 opacity-100 hover:scale-110 hover:text-red-800'
              : 'text-subtle-foreground opacity-0 hover:scale-110 hover:text-foreground group-hover:opacity-100',
          ].join(' ')}
          aria-label={isDeleteConfirming ? `Confirm delete thread ${conversation.title}` : `Delete thread ${conversation.title}`}
        >
          {isDeleteConfirming ? <Check size={15} strokeWidth={2.4} /> : <Trash2 size={15} strokeWidth={2} />}
        </button>
      </Tooltip>
    </div>
  )
}

function FolderSection({
  group,
  isCollapsed,
  onCreateConversation,
  onOpenFolderPath,
  onToggleCollapsed,
  onSelectFolder,
  onSelectConversation,
  onDeleteConversation,
}: FolderSectionProps) {
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
                    onClick={() => {
                      onCreateConversation(group.folder.id)
                    }}
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
                    onClick={() => {
                      onCreateConversation(group.folder.id)
                    }}
                    className="absolute inset-0 flex items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all duration-200 ease-out pointer-events-none hover:scale-110 hover:text-foreground group-hover/folder-row:pointer-events-auto group-hover/folder-row:opacity-100"
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
                  <HistoryListItem
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

export function ConversationHistoryList({
  conversationGroups,
  onCreateConversation,
  onOpenFolderPath,
  onSelectConversation,
  onDeleteConversation,
  onSelectFolder,
}: ConversationHistoryListProps) {
  const [collapsedFolderState, setCollapsedFolderState] = useState<Record<string, boolean>>({})

  function handleToggleFolder(folderId: string | null) {
    const stateKey = folderId ?? 'unfiled'
    setCollapsedFolderState((currentValue) => ({
      ...currentValue,
      [stateKey]: !currentValue[stateKey],
    }))
  }

  return (
    <div className="space-y-4 pb-1">
      {conversationGroups.map((group) => {
        const stateKey = group.folder.id ?? 'unfiled'

        return (
          <FolderSection
            key={stateKey}
            group={group}
            isCollapsed={Boolean(collapsedFolderState[stateKey])}
            onCreateConversation={onCreateConversation}
            onOpenFolderPath={onOpenFolderPath}
            onToggleCollapsed={() => handleToggleFolder(group.folder.id)}
            onSelectFolder={onSelectFolder}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
          />
        )
      })}
    </div>
  )
}
