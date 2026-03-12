import type { KeyboardEvent, MouseEvent } from 'react'
import { Undo2 } from 'lucide-react'
import { chatMessageSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'

interface UserMessageProps {
  content: string
  onEdit?: () => void
  onRevert?: () => void
}

function UserMessageBody({ content }: Pick<UserMessageProps, 'content'>) {
  return content.trim().length > 0 ? <div>{content}</div> : null
}

export function UserMessage({ content, onEdit, onRevert }: UserMessageProps) {
  const surfaceClassName = [
    chatMessageSurfaceClassName,
    'group inline-flex w-fit min-w-0 max-w-full items-center gap-1.5 px-4 py-2.5 text-[15px] leading-6 text-foreground align-top',
    onEdit ? 'cursor-pointer' : '',
  ].join(' ')

  const handleSurfaceClick = () => {
    onEdit?.()
  }

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onEdit?.()
    }
  }

  const handleUndoClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onRevert?.()
  }

  return (
    <div
      className={surfaceClassName}
      onClick={onEdit ? handleSurfaceClick : undefined}
      onKeyDown={onEdit ? handleSurfaceKeyDown : undefined}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      aria-label={onEdit ? 'Edit message' : undefined}
    >
      <div className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
        <UserMessageBody content={content} />
      </div>

      {onRevert ? (
        <Tooltip content="Revert and edit this message" side="right">
          <button
            type="button"
            onClick={handleUndoClick}
            className="invisible inline-flex h-4 w-4 shrink-0 items-center justify-center text-subtle-foreground opacity-0 transition-[color,opacity] duration-150 hover:text-foreground group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            aria-label="Revert and edit this message"
          >
            <Undo2 size={13} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  )
}
