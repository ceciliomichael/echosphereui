import { Check, ChevronDown } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuPosition } from '../../hooks/useFloatingMenuPosition'

export interface DropdownOption {
  label: string
  value: string
}

interface DropdownFieldProps {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  fitToContent?: boolean
  flushOptions?: boolean
  id?: string
  onChange: (value: string) => void
  options: readonly DropdownOption[]
  value: string
}

export function DropdownField({
  ariaLabel,
  className,
  disabled = false,
  fitToContent = false,
  flushOptions = false,
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
  const menuStyle = useFloatingMenuPosition({
    anchorRef: buttonRef,
    isOpen,
    menuRef: listboxRef,
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

    const selectedIndex = options.findIndex((option) => option.value === value)
    if (selectedIndex >= 0) {
      setHighlightedIndex(selectedIndex)
    }
  }, [isOpen, options, value])

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

  function resetHighlightToSelected() {
    const selectedIndex = options.findIndex((option) => option.value === value)
    if (selectedIndex >= 0) {
      setHighlightedIndex(selectedIndex)
    }
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
        className={[
          'flex h-9 items-center justify-between rounded-xl border bg-surface px-3 text-[13px] font-normal text-foreground transition-[background-color,border-color,color] hover:bg-[var(--dropdown-control-hover-surface)] hover:border-[var(--dropdown-control-hover-border)] disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted-foreground md:text-sm',
          isOpen
            ? 'border-[var(--dropdown-control-open-border)] bg-[var(--dropdown-control-open-surface)]'
            : 'border-border',
          fitToContent ? 'w-auto max-w-full' : 'w-full',
        ].join(' ')}
      >
        <span className={['text-left', fitToContent ? 'pr-2' : 'truncate pr-3'].join(' ')}>
          {selectedOption?.label ?? ''}
        </span>
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
              data-floating-menu-root="true"
              role="listbox"
              tabIndex={-1}
              aria-labelledby={controlId}
              onKeyDown={handleListboxKeyDown}
              onMouseLeave={resetHighlightToSelected}
              className={[
                'fixed z-50 overflow-y-auto rounded-xl border border-border bg-surface shadow-soft',
                flushOptions ? 'p-0' : fitToContent ? 'p-0.5' : 'p-1',
              ].join(' ')}
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
                      'flex h-9 w-full items-center justify-between px-3 text-left text-[13px] transition-[background-color,color,box-shadow] md:text-sm',
                      flushOptions ? 'rounded-none' : 'rounded-lg',
                      isHighlighted
                        ? 'bg-[var(--dropdown-option-active-surface)] text-foreground shadow-sm'
                        : 'text-foreground hover:bg-[var(--dropdown-option-active-surface)]',
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
