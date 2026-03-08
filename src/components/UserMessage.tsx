import { chatSurfaceClassName } from '../lib/chatStyles'

interface UserMessageProps {
  content: string
  onEdit?: () => void
}

export function UserMessage({ content, onEdit }: UserMessageProps) {
  const className = [
    chatSurfaceClassName,
    'max-w-[82%] px-4 py-3 text-[15px] leading-6 text-foreground transition-colors duration-150',
    onEdit ? 'cursor-pointer hover:border-action/40' : '',
  ].join(' ')

  if (!onEdit) {
    return <div className={className}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`${className} text-left outline-none`}
      aria-label="Edit message"
      title="Edit this message"
    >
      {content}
    </button>
  )
}
