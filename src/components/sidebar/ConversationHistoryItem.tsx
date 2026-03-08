import { Check, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ConversationPreview } from '../../types/chat'
import { Tooltip } from '../Tooltip'

interface ConversationHistoryItemProps {
  conversation: ConversationPreview
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
}

export function ConversationHistoryItem({
  conversation,
  onSelectConversation,
  onDeleteConversation,
}: ConversationHistoryItemProps) {
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
      if (!targetNode || deleteButtonRef.current?.contains(targetNode)) {
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
        'group flex w-full items-center gap-2 rounded-xl px-2 py-0.5 transition-colors',
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
          'min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors',
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
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full origin-center transform-gpu transition-[color,opacity,transform] duration-150 ease-out',
            isDeleteConfirming
              ? 'text-red-700 opacity-100 hover:scale-110 hover:text-red-800'
              : 'text-subtle-foreground opacity-0 hover:scale-110 hover:text-foreground group-hover:opacity-100',
          ].join(' ')}
          aria-label={isDeleteConfirming ? `Confirm delete thread ${conversation.title}` : `Delete thread ${conversation.title}`}
        >
          {isDeleteConfirming ? (
            <Check size={15} strokeWidth={2.4} className="block" />
          ) : (
            <Trash2 size={15} strokeWidth={2} className="block" />
          )}
        </button>
      </Tooltip>
    </div>
  )
}
