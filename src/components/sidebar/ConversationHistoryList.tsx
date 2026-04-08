import { useEffect, useState } from 'react'
import type { ConversationGroupPreview } from '../../types/chat'
import { FolderOpen } from 'lucide-react'
import { ConversationFolderSection } from './ConversationFolderSection'

interface ConversationHistoryListProps {
  conversationGroups: ConversationGroupPreview[]
  onCreateConversation: (folderId?: string | null) => void
  onDeleteConversation: (conversationId: string) => void
  onDeleteFolder: (folderId: string) => Promise<void>
  onMoveFolder: (folderId: string, direction: 'up' | 'down') => Promise<void>
  onRenameFolder: (folderId: string, name: string) => Promise<void>
  onSelectConversation: (conversationId: string) => void
  onSelectFolder: (folderId: string | null) => void
}

const COLLAPSED_FOLDER_STATE_STORAGE_KEY = 'echosphere:sidebar-collapsed-folders'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readCollapsedFolderState(): Record<string, boolean> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(COLLAPSED_FOLDER_STATE_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) {
      return {}
    }

    const nextState: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') {
        nextState[key] = value
      }
    }

    return nextState
  } catch {
    return {}
  }
}

export function ConversationHistoryList({
  conversationGroups,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
  onDeleteFolder,
  onMoveFolder,
  onRenameFolder,
  onSelectFolder,
}: ConversationHistoryListProps) {
  const [collapsedFolderState, setCollapsedFolderState] = useState<Record<string, boolean>>(() =>
    readCollapsedFolderState(),
  )
  const hasAnyConversations = conversationGroups.some((group) => group.conversations.length > 0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(COLLAPSED_FOLDER_STATE_STORAGE_KEY, JSON.stringify(collapsedFolderState))
    } catch {
      // Ignore storage write failures.
    }
  }, [collapsedFolderState])

  function handleToggleFolder(folderId: string | null) {
    const stateKey = folderId ?? 'unfiled'
    setCollapsedFolderState((currentValue) => ({
      ...currentValue,
      [stateKey]: !currentValue[stateKey],
    }))
  }

  return (
    <div className="flex min-h-full flex-col pb-1">
      {!hasAnyConversations ? (
        <div className="flex min-h-full flex-1 items-center justify-center px-4 py-6 text-center">
          <div className="flex max-w-[240px] flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-subtle-foreground">
              <FolderOpen size={22} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No project folders yet</p>
              <p className="text-sm leading-6 text-subtle-foreground">
                Add a project folder to start a thread
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {conversationGroups.map((group) => {
            const stateKey = group.folder.id ?? 'unfiled'
            const folderIndex = conversationGroups.findIndex((candidate) => candidate.folder.id === group.folder.id)
            const canMoveUp = group.folder.id !== null && folderIndex > 1
            const canMoveDown = group.folder.id !== null && folderIndex > 0 && folderIndex < conversationGroups.length - 1

            return (
              <ConversationFolderSection
                key={stateKey}
                group={group}
                isCollapsed={Boolean(collapsedFolderState[stateKey])}
                onCreateConversation={onCreateConversation}
                onMoveFolder={onMoveFolder}
                onToggleCollapsed={() => handleToggleFolder(group.folder.id)}
                onDeleteFolder={onDeleteFolder}
                onRenameFolder={onRenameFolder}
                onSelectFolder={onSelectFolder}
                onSelectConversation={onSelectConversation}
                onDeleteConversation={onDeleteConversation}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
