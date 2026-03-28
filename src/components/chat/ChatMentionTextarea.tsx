import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ClipboardEvent, type ChangeEvent, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { ChatMentionText } from './ChatMentionText'

interface ChatMentionTextareaProps {
  className?: string
  disabled?: boolean
  mentionPathMap?: ReadonlyMap<string, string>
  onBlur?: () => void
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
  onInput?: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void
  onClick?: (event: MouseEvent<HTMLTextAreaElement>) => void
  onSelect?: () => void
  placeholder?: string
  rows?: number
  style?: CSSProperties
  textareaRef: RefObject<HTMLTextAreaElement>
  value: string
}

const MAX_TEXTAREA_HEIGHT_PX = 200

export function ChatMentionTextarea({
  className,
  disabled = false,
  mentionPathMap,
  onBlur,
  onChange,
  onFocus,
  onInput,
  onKeyDown,
  onPaste,
  onClick,
  onSelect,
  placeholder,
  rows = 1,
  style,
  textareaRef,
  value,
}: ChatMentionTextareaProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 })
  const textareaStyle = useMemo(
    () =>
      ({
        ...style,
        caretColor: 'var(--color-foreground)',
      }) as CSSProperties,
    [style],
  )

  const textareaClassName = useMemo(
    () =>
      [
        'min-h-[28px] max-h-[200px] w-full resize-none border-none bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-subtle-foreground focus:outline-none focus:ring-0',
        className,
      ]
        .filter(Boolean)
        .join(' '),
    [className],
  )

  const sharedLayerClassName = useMemo(
    () =>
      [
        'min-h-[28px] max-h-[200px] w-full text-[15px] leading-6',
        className,
      ]
        .filter(Boolean)
        .join(' '),
    [className],
  )

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    const backdrop = backdropRef.current
    if (!textarea || !backdrop) {
      return
    }

    const syncHeight = () => {
      textarea.style.height = 'auto'
      backdrop.style.height = 'auto'

      const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)
      textarea.style.height = `${nextHeight}px`
      backdrop.style.height = `${nextHeight}px`
    }

    syncHeight()
    setScrollOffset({
      left: textarea.scrollLeft,
      top: textarea.scrollTop,
    })

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            syncHeight()
            setScrollOffset({
              left: textarea.scrollLeft,
              top: textarea.scrollTop,
            })
          })
        : null

    resizeObserver?.observe(textarea)

    return () => {
      resizeObserver?.disconnect()
    }
  }, [textareaRef, value])

  function handleScroll() {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    setScrollOffset({
      left: textarea.scrollLeft,
      top: textarea.scrollTop,
    })
  }

  return (
    <div className="relative w-full">
      <div ref={backdropRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={sharedLayerClassName}
          style={{
            transform: `translate(${-scrollOffset.left}px, ${-scrollOffset.top}px)`,
            ...style,
          }}
        >
          <ChatMentionText text={value} mentionPathMap={mentionPathMap} variant="backdrop" />
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onBlur={onBlur}
        onChange={onChange}
        onFocus={onFocus}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onClick={onClick}
        onScroll={handleScroll}
        onSelect={onSelect}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        className={textareaClassName}
        style={textareaStyle}
      />
    </div>
  )
}
