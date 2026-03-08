import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { chatSurfaceClassName } from '../lib/chatStyles'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = value.trim().length > 0 && !disabled

  function handleSend() {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  return (
    <div className="w-full">
      <div className={`${chatSurfaceClassName} p-4`}>
        <div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className="min-h-[28px] max-h-[150px] w-full resize-none border-none bg-transparent text-[15px] leading-6 text-[#111111] outline-none placeholder:text-[#9A9CA2] focus:outline-none focus:ring-0"
            style={{ fieldSizing: 'content' } as CSSProperties}
          />
        </div>

        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className={[
              'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150',
              canSend
                ? 'cursor-pointer bg-[#141414] text-white hover:scale-[1.03] hover:bg-[#000000] active:scale-95'
                : 'cursor-not-allowed bg-[#F2F3F5] text-[#A0A4AB]',
            ].join(' ')}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
