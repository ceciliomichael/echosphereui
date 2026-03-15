import { useState } from 'react'
import type { ConversationGroupPreview } from '../../types/chat'
import { ConversationFolderSection } from './ConversationFolderSection'

interface ConversationHistoryListProps {
  conversationGroups: ConversationGroupPreview[]
  onCreateConversation: (folderId?: string | null) => void
  onDeleteConversation: (conversationId: string) => void
  onDeleteFolder: (folderId: string) => Promise<void>
  onRenameFolder: (folderId: string, name: string) => Promise<void>
  onSelectConversation: (conversationId: string) => void
  onSelectFolder: (folderId: string | null) => void
}

export function ConversationHistoryList({
  conversationGroups,
  onCreateConversation,
  onSelectConversation,
  onDeleteConversation,
  onDeleteFolder,
  onRenameFolder,
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
    <div className="space-y-2.5 pb-1">
      {conversationGroups.map((group) => {
        const stateKey = group.folder.id ?? 'unfiled'

        return (
          <ConversationFolderSection
            key={stateKey}
            group={group}
            isCollapsed={Boolean(collapsedFolderState[stateKey])}
            onCreateConversation={onCreateConversation}
            onToggleCollapsed={() => handleToggleFolder(group.folder.id)}
            onDeleteFolder={onDeleteFolder}
            onRenameFolder={onRenameFolder}
            onSelectFolder={onSelectFolder}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
          />
        )
      })}
    </div>
  )
}
