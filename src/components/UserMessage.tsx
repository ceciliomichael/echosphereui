import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { Undo2 } from 'lucide-react'
import { chatConversationSurfacePaddingClassName, chatMessageSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'
import { ChatMentionText } from './chat/ChatMentionText'

interface UserMessageProps {
  content: string
  onEdit?: () => void
  onRevert?: () => void
}

export function UserMessage({ content, onEdit, onRevert }: UserMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [isMultiline, setIsMultiline] = useState(false)
  const trimmedContent = content.trim()
  const contentClampClassName = 'line-clamp-10 overflow-hidden'
  const surfaceAlignmentClassName = isMultiline ? 'items-stretch' : 'items-center'
  const revertButtonContainerClassName = isMultiline ? 'self-stretch flex items-end' : 'self-center flex items-center'

  const surfaceClassName = [
    chatMessageSurfaceClassName,
    `group inline-flex w-fit min-w-0 max-w-full ${surfaceAlignmentClassName} gap-1.5 ${chatConversationSurfacePaddingClassName} text-[15px] leading-6 text-foreground align-top`,
    onEdit ? 'cursor-pointer' : '',
  ].join(' ')

  useLayoutEffect(() => {
    const contentElement = contentRef.current
    if (!contentElement || trimmedContent.length === 0) {
      setIsMultiline(false)
      return
    }

    const updateMultilineState = () => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(contentElement).lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        setIsMultiline(false)
        return
      }

      setIsMultiline(contentElement.getBoundingClientRect().height > lineHeight * 1.5)
    }

    updateMultilineState()

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            updateMultilineState()
          })
        : null

    resizeObserver?.observe(contentElement)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [trimmedContent])

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
      <div ref={contentRef} className={`min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] ${contentClampClassName}`}>
        {trimmedContent.length > 0 ? <ChatMentionText text={content} variant="rendered" /> : null}
      </div>

      {onRevert ? (
        <div className={revertButtonContainerClassName}>
          <Tooltip content="Revert and edit this message" side="right">
            <button
              type="button"
              onClick={handleUndoClick}
              className="invisible inline-flex h-4 w-4 shrink-0 items-center justify-center leading-none text-subtle-foreground opacity-0 transition-[color,opacity] duration-150 hover:text-foreground group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              aria-label="Revert and edit this message"
            >
              <Undo2 size={13} />
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  )
}
