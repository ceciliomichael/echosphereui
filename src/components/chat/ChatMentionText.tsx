import { memo } from 'react'
import { splitChatMentionSegments } from '../../lib/chatMentions'

interface ChatMentionTextProps {
  className?: string
  mentionPathMap?: ReadonlyMap<string, string>
  text: string
  variant?: 'backdrop' | 'inline'
}

export const ChatMentionText = memo(function ChatMentionText({
  className,
  mentionPathMap,
  text,
  variant = 'inline',
}: ChatMentionTextProps) {
  const segments = splitChatMentionSegments(text, mentionPathMap)
  const rootClassName = [
    'whitespace-pre-wrap [overflow-wrap:anywhere]',
    variant === 'backdrop' ? 'select-none text-foreground' : 'text-foreground',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (segments.length === 0) {
    return null
  }

  return (
    <div className={rootClassName}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`text-${index}`}>{segment.text}</span>
        }

        const mentionClassName = [
          'inline-block',
          'rounded-[4px] bg-[rgba(59,130,246,0.18)] font-medium text-foreground',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <span
            key={`mention-${index}`}
            className={mentionClassName}
            title={segment.path ?? segment.label}
          >
            {segment.text}
          </span>
        )
      })}
    </div>
  )
})
