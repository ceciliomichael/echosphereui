import { chatMessageContentWidthClassName, chatMessageSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'

interface UserMessageProps {
  content: string
  onEdit?: () => void
}

export function UserMessage({ content, onEdit }: UserMessageProps) {
  const className = [
    chatMessageSurfaceClassName,
    chatMessageContentWidthClassName,
    'w-full px-4 py-3 text-[15px] leading-6 text-foreground transition-colors duration-150',
    onEdit ? 'cursor-pointer hover:border-action/40' : '',
  ].join(' ')

  if (!onEdit) {
    return <div className={className}>{content}</div>
  }

  return (
    <Tooltip content="Edit this message" side="right">
      <button
        type="button"
        onClick={onEdit}
        className={`${className} text-left`}
        aria-label="Edit message"
      >
        {content}
      </button>
    </Tooltip>
  )
}
