import { Check, Trash2 } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import type { ConversationPreview } from '../../types/chat'

interface ConversationHistoryListProps {
  conversations: ConversationPreview[]
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
}

interface HistoryListItemProps {
  conversation: ConversationPreview
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
}

function HistoryListItem({
  conversation,
  onSelectConversation,
  onDeleteConversation,
}: HistoryListItemProps) {
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)

  useEffect(() => {
    setIsDeleteConfirming(false)
  }, [conversation.id])

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
            : 'hover:bg-white/60',
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

      <button
        type="button"
        onClick={handleDeleteClick}
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center transition-all',
          isDeleteConfirming
            ? 'text-red-700 opacity-100 hover:text-red-800'
            : 'text-subtle-foreground opacity-0 hover:text-foreground group-hover:opacity-100',
        ].join(' ')}
        aria-label={isDeleteConfirming ? `Confirm delete ${conversation.title}` : `Delete ${conversation.title}`}
        title={isDeleteConfirming ? 'Click again to delete' : 'Delete conversation'}
      >
        {isDeleteConfirming ? <Check size={15} strokeWidth={2.4} /> : <Trash2 size={15} strokeWidth={2} />}
      </button>
    </div>
  )
}

export function ConversationHistoryList({
  conversations,
  onSelectConversation,
  onDeleteConversation,
}: ConversationHistoryListProps) {
  if (conversations.length === 0) {
    return <p className="px-2 py-6 text-sm text-subtle-foreground">No chat history yet.</p>
  }

  return (
    <div className="space-y-2">
      {conversations.map((conversation) => (
        <HistoryListItem
          key={conversation.id}
          conversation={conversation}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
        />
      ))}
    </div>
  )
}
