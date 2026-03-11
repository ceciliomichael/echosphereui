import { Search, RefreshCw, Cpu, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuPosition } from '../../hooks/useFloatingMenuPosition'

export interface ModelSelectorOption {
  label: string
  providerLabel: string
  value: string
}

interface ModelSelectorFieldProps {
  disabled?: boolean
  onChange: (value: string) => void
  options: readonly ModelSelectorOption[]
  value: string
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

export function ModelSelectorField({
  disabled = false,
  onChange,
  options,
  value,
}: ModelSelectorFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const normalizedSearch = normalizeSearch(searchValue)
  const menuStyle = useFloatingMenuPosition({
    anchorRef: buttonRef,
    isOpen,
    menuRef,
  })

  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? options[0], [options, value])
  const filteredOptions = useMemo(() => {
    if (normalizedSearch.length === 0) {
      return options
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedSearch))
  }, [normalizedSearch, options])

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

  useEffect(() => {
    if (!isOpen) {
      return
    }

    searchInputRef.current?.focus()
  }, [isOpen])

  function handleSelect(nextValue: string) {
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
        <Cpu size={15} className="mr-2 shrink-0 text-muted-foreground" />
        <span className="min-w-0 max-w-[18rem] truncate pr-3 text-left">{selectedOption?.label ?? 'Select model'}</span>
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
              className="fixed z-40 w-[min(18rem,calc(100vw-1rem))] min-w-[10rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
              style={menuStyle}
            >
              <div className="flex items-center gap-1.5 border-b border-border px-2 py-2">
                <div className="relative min-w-0 flex-1 pr-1">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search models..."
                    className="h-9 w-full rounded-xl border border-border bg-surface-muted pl-8 pr-2.5 text-sm text-foreground outline-none placeholder:text-subtle-foreground"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Refresh model list"
                  onClick={() => setSearchValue('')}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-muted text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <div role="listbox" className="max-h-56 space-y-0 overflow-y-auto">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      onClick={() => handleSelect(option.value)}
                      className={[
                        'flex w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left transition-colors',
                        option.value === value
                          ? 'bg-[var(--dropdown-option-active-surface)] text-foreground hover:bg-[var(--dropdown-option-active-hover-surface)]'
                          : 'text-foreground hover:bg-[var(--dropdown-option-hover-surface)]',
                      ].join(' ')}
                    >
                      <span className="truncate text-[15px] leading-5">{option.label}</span>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {option.providerLabel}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-2.5 py-2 text-sm text-muted-foreground">No models found.</p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
