import type { ChatAttachment } from '../types/chat'
import { chatMessageContentWidthClassName, chatMessageSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'
import { AttachmentPillList } from './chat/AttachmentPillList'

interface UserMessageProps {
  attachments?: readonly ChatAttachment[]
  content: string
  onEdit?: () => void
}

function UserMessageBody({ attachments = [], content }: Pick<UserMessageProps, 'attachments' | 'content'>) {
  return (
    <div className="space-y-2.5">
      <AttachmentPillList attachments={attachments} />
      {content.trim().length > 0 ? <div>{content}</div> : null}
    </div>
  )
}

export function UserMessage({ attachments, content, onEdit }: UserMessageProps) {
  const className = [
    chatMessageSurfaceClassName,
    chatMessageContentWidthClassName,
    'w-full px-4 py-3 text-[15px] leading-6 text-foreground transition-colors duration-150',
    onEdit ? 'cursor-pointer hover:border-[var(--user-message-hover-border)]' : '',
  ].join(' ')

  if (!onEdit) {
    return (
      <div className={className}>
        <UserMessageBody attachments={attachments} content={content} />
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
        <UserMessageBody attachments={attachments} content={content} />
      </button>
    </Tooltip>
  )
}
