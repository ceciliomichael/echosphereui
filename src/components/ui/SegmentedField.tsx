import { GitCompareArrows } from 'lucide-react'
import { Tooltip } from '../Tooltip'

export interface SegmentedFieldOption {
  label: string
  value: string
}

interface SegmentedFieldProps {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  onChange: (value: string) => void
  options: readonly SegmentedFieldOption[]
  value: string
}

interface DiffPanelSegmentedToggleProps {
  isOpen: boolean
  onToggle: () => void
  totalAddedLineCount: number
  totalRemovedLineCount: number
}

export function SegmentedField({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  value,
}: SegmentedFieldProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[
        'inline-flex gap-1 rounded-xl border border-border bg-background p-1 shadow-[var(--shadow-control-inset)]',
        disabled ? 'opacity-70' : '',
        className ?? '',
      ].join(' ')}
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={[
              'min-w-[56px] rounded-lg px-3 py-1.5 text-[13px] transition-colors md:text-sm',
              isActive
                ? 'bg-[var(--segmented-control-active-surface)] font-medium text-foreground shadow-sm'
                : 'bg-transparent font-normal text-muted-foreground hover:bg-[var(--segmented-control-hover-surface)] hover:text-foreground',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function DiffPanelSegmentedToggle({
  isOpen,
  onToggle,
  totalAddedLineCount,
  totalRemovedLineCount,
}: DiffPanelSegmentedToggleProps) {
  return (
    <Tooltip content={isOpen ? 'Hide diff panel' : 'Show diff panel'} side="bottom">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <GitCompareArrows size={16} className="shrink-0" />
        <span className="text-emerald-600 dark:text-emerald-400">{`+${totalAddedLineCount}`}</span>
        <span className="text-red-600 dark:text-red-400">{`-${totalRemovedLineCount}`}</span>
      </button>
    </Tooltip>
  )
}
