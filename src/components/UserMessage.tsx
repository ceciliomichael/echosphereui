import { chatMessageContentWidthClassName, chatMessageSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'

interface UserMessageProps {
  content: string
  onEdit?: () => void
}

function UserMessageBody({ content }: Pick<UserMessageProps, 'content'>) {
  return content.trim().length > 0 ? <div>{content}</div> : null
}

export function UserMessage({ content, onEdit }: UserMessageProps) {
  const className = [
    chatMessageSurfaceClassName,
    chatMessageContentWidthClassName,
    'w-full px-4 py-3 text-[15px] leading-6 text-foreground transition-colors duration-150',
    onEdit ? 'cursor-pointer hover:border-[var(--user-message-hover-border)]' : '',
  ].join(' ')

  if (!onEdit) {
    return (
      <div className={className}>
        <UserMessageBody content={content} />
      </div>
    )
  }

  return (
    <Tooltip content="Edit this message" side="right">
      <button
        type="button"
        onClick={onEdit}
        className={`${className} text-left`}
        aria-label="Edit message"
      >
        <UserMessageBody content={content} />
      </button>
    </Tooltip>
  )
}
