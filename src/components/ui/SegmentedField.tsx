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
                ? 'bg-surface font-medium text-foreground shadow-sm'
                : 'bg-transparent font-normal text-muted-foreground hover:bg-surface hover:text-foreground',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
