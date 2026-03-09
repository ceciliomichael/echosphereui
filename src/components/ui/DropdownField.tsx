import { Check, ChevronDown } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption {
  label: string
  value: string
}

interface DropdownFieldProps {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  id?: string
  onChange: (value: string) => void
  options: readonly DropdownOption[]
  value: string
}

export function DropdownField({
  ariaLabel,
  className,
  disabled = false,
  id,
  onChange,
  options,
  value,
}: DropdownFieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const listboxId = `${controlId}-listbox`
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const listboxRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  )
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    left: 0,
    minWidth: 0,
    top: 0,
    visibility: 'hidden',
  })
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  )

  useEffect(() => {
    const selectedIndex = options.findIndex((option) => option.value === value)
    if (selectedIndex >= 0) {
      setHighlightedIndex(selectedIndex)
    }
  }, [options, value])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target
      if (
        target instanceof Node &&
        !containerRef.current?.contains(target) &&
        !listboxRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      return
    }

    function updateMenuPosition() {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const listboxRect = listboxRef.current?.getBoundingClientRect()
      if (!buttonRect) {
        return
      }

      const viewportHeight = window.innerHeight
      const menuHeight = listboxRect?.height ?? 0
      const spaceBelow = viewportHeight - buttonRect.bottom
      const shouldOpenAbove = spaceBelow < menuHeight + 12 && buttonRect.top > spaceBelow

      setMenuStyle({
        left: buttonRect.left,
        minWidth: buttonRect.width,
        top: shouldOpenAbove ? Math.max(8, buttonRect.top - menuHeight - 6) : buttonRect.bottom + 6,
        visibility: 'visible',
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, highlightedIndex])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    listboxRef.current?.focus()
    const activeOption = listboxRef.current?.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`)
    activeOption?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, isOpen])

  function commitValue(nextValue: string) {
    setIsOpen(false)
    if (nextValue !== value) {
      onChange(nextValue)
    }
    buttonRef.current?.focus()
  }

  function handleButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const selectedIndex = Math.max(
        0,
        options.findIndex((option) => option.value === value),
      )
      setHighlightedIndex(selectedIndex)
      setIsOpen(true)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setIsOpen((currentValue) => !currentValue)
    }
  }

  function handleListboxKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((currentValue) => Math.min(currentValue + 1, options.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((currentValue) => Math.max(currentValue - 1, 0))
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setHighlightedIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setHighlightedIndex(options.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const highlightedOption = options[highlightedIndex]
      if (highlightedOption) {
        commitValue(highlightedOption.value)
      }
    }
  }

  return (
    <div ref={containerRef} className={['relative', className].filter(Boolean).join(' ')}>
      <button
        id={controlId}
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        onKeyDown={handleButtonKeyDown}
        className="flex h-9 w-full items-center justify-between rounded-xl border border-border bg-surface px-3 text-[13px] font-normal text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground md:text-sm"
      >
        <span className="truncate pr-3 text-left">{selectedOption?.label ?? ''}</span>
        <ChevronDown
          size={16}
          strokeWidth={2.2}
          className={['shrink-0 text-muted-foreground transition-transform', isOpen ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={controlId}
              onKeyDown={handleListboxKeyDown}
              className="fixed z-50 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-soft"
              style={menuStyle}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value
                const isHighlighted = index === highlightedIndex

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-option-index={index}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitValue(option.value)}
                    className={[
                      'flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-[13px] transition-colors md:text-sm',
                      isHighlighted ? 'bg-background text-foreground' : 'text-foreground hover:bg-background',
                    ].join(' ')}
                  >
                    <span className="truncate pr-3">{option.label}</span>
                    {isSelected ? <Check size={16} strokeWidth={2.2} className="shrink-0 text-foreground" /> : null}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
