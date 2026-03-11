import { Bot, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuPosition } from '../../hooks/useFloatingMenuPosition'
import type { ChatMode } from '../../types/chat'

export interface ChatModeOption {
  description: string
  label: string
  value: ChatMode
}

interface ChatModeSelectorFieldProps {
  disabled?: boolean
  onChange: (value: ChatMode) => void
  options: readonly ChatModeOption[]
  value: ChatMode
}

export function ChatModeSelectorField({
  disabled = false,
  onChange,
  options,
  value,
}: ChatModeSelectorFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? options[0], [options, value])
  const menuStyle = useFloatingMenuPosition({
    anchorRef: buttonRef,
    isOpen,
    menuRef,
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (
        target instanceof Node &&
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  function handleSelect(nextValue: ChatMode) {
    setIsOpen(false)
    if (nextValue !== value) {
      onChange(nextValue)
    }
  }

  return (
    <div ref={containerRef} className="relative w-fit max-w-full">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex h-9 w-auto max-w-full items-center justify-between rounded-xl border border-border bg-surface px-3 text-[13px] font-normal text-foreground transition-colors hover:bg-[var(--dropdown-control-hover-surface)] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground md:text-sm"
      >
        <Bot size={15} className="mr-2 shrink-0 text-muted-foreground" />
        <span className="min-w-0 max-w-[12rem] truncate pr-3 text-left">{selectedOption?.label ?? 'Select mode'}</span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          className={['shrink-0 text-muted-foreground transition-transform', isOpen ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              data-floating-menu-root="true"
              className="fixed z-40 w-[min(14rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
              style={menuStyle}
            >
              <div role="listbox" className="space-y-0.5 p-1.5">
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => handleSelect(option.value)}
                    className={[
                      'flex w-full flex-col items-start gap-0.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                      option.value === value
                        ? 'bg-[var(--dropdown-option-active-surface)] text-foreground hover:bg-[var(--dropdown-option-active-hover-surface)]'
                        : 'text-foreground hover:bg-[var(--dropdown-option-hover-surface)]',
                    ].join(' ')}
                  >
                    <span className="text-[15px] leading-5">{option.label}</span>
                    <span className="text-[11px] text-muted-foreground">{option.description}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
