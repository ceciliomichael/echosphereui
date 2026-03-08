import { useState } from 'react'
import type { ConversationGroupPreview } from '../../types/chat'
import { ConversationFolderSection } from './ConversationFolderSection'

interface ConversationHistoryListProps {
  conversationGroups: ConversationGroupPreview[]
  onCreateConversation: (folderId?: string | null) => void
  onOpenFolderPath: (folderPath: string) => void
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
  onSelectFolder: (folderId: string | null) => void
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
          <ConversationFolderSection
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
