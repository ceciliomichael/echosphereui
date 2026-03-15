import { Check, ChevronDown, Monitor, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuPosition } from '../../hooks/useFloatingMenuPosition'
import { Tooltip } from '../Tooltip'

interface RuntimeTargetOption {
  description: string
  disabled?: boolean
  icon: typeof Monitor
  label: string
  value: 'local' | 'mobile'
}

const TARGET_OPTIONS: readonly RuntimeTargetOption[] = [
  {
    description: 'Runs commands against your current local workspace.',
    icon: Monitor,
    label: 'Local',
    value: 'local',
  },
  {
    description: 'Targets a mobile runtime environment (coming soon).',
    disabled: true,
    icon: Smartphone,
    label: 'Mobile',
    value: 'mobile',
  },
] as const

export function RuntimeTargetSelectorField({ triggerClassName }: { triggerClassName?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
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
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative w-fit max-w-full">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-open={isOpen ? 'true' : 'false'}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={['chat-runtime-control-trigger w-auto max-w-full', triggerClassName].filter(Boolean).join(' ')}
      >
        <Monitor size={14} className="mr-1.5 shrink-0 text-current" />
        <span className="chat-runtime-control-label">Local</span>
        <ChevronDown
          size={14}
          className={['ml-1.5 shrink-0 text-current transition-transform', isOpen ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              data-floating-menu-root="true"
              role="listbox"
              aria-label="Runtime targets"
              className="fixed z-40 min-w-[12rem] overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-soft space-y-1.5"
              style={menuStyle}
            >
              {TARGET_OPTIONS.map((option) => {
                const Icon = option.icon
                const optionRow = (
                  <div className="w-full">
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.value === 'local'}
                      disabled={option.disabled === true}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!option.disabled) {
                          setIsOpen(false)
                        }
                      }}
                      className={[
                        'flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-[13px] transition-[background-color,color,box-shadow] md:text-sm',
                        option.disabled
                          ? 'cursor-not-allowed text-disabled-foreground'
                          : 'bg-[var(--dropdown-option-active-surface)] text-foreground shadow-sm',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon size={14} className="shrink-0" />
                        <span className="truncate">{option.label}</span>
                      </span>
                      {option.value === 'local' ? <Check size={16} strokeWidth={2.2} className="shrink-0" /> : null}
                    </button>
                  </div>
                )

                return (
                  <Tooltip key={option.value} content={option.description} side="right" fullWidthTrigger>
                    {optionRow}
                  </Tooltip>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
