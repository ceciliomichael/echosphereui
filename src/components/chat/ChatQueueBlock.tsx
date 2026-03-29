import { useState } from 'react'
import type { RefObject } from 'react'
import { ChevronDown, ChevronRight, Clock, Trash2 } from 'lucide-react'
import type { ChatAttachment, QueuedMessage } from '../../types/chat'
import { ChatQueueItem } from './ChatQueueItem'

interface ChatQueueBlockProps {
  queuedMessages: readonly QueuedMessage[]
  editCancelBoundaryRef?: RefObject<HTMLElement>
  onClearQueue?: () => void
  onForceSend: (id: string) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, content: string, attachments?: ChatAttachment[]) => void
}

export function ChatQueueBlock({
  queuedMessages,
  editCancelBoundaryRef,
  onClearQueue,
  onForceSend,
  onRemove,
  onUpdate,
}: ChatQueueBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  if (queuedMessages.length === 0) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-t-2xl rounded-b-none border border-border border-b-0 bg-surface/50 shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded((currentValue) => !currentValue)}
        className="flex h-11 w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-surface-muted"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Clock size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">Queued messages</span>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-surface px-1.5 text-[11px] font-semibold text-muted-foreground">
            {queuedMessages.length}
          </span>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          {onClearQueue ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onClearQueue()
              }}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Trash2 size={13} />
              Clear all
            </button>
          ) : null}
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {isExpanded ? (
        <div className="border-t border-border">
          <div className="max-h-72 overflow-y-auto">
            {queuedMessages.map((message, index) => (
              <ChatQueueItem
                key={message.id}
                index={index}
                message={message}
                editCancelBoundaryRef={editCancelBoundaryRef}
                onForceSend={onForceSend}
                onRemove={onRemove}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
