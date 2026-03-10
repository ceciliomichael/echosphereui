import { DropdownField } from '../ui/DropdownField'
import type { ReasoningEffort } from '../../types/chat'

const REASONING_EFFORT_OPTIONS = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'XHigh', value: 'xhigh' },
] as const

interface ReasoningEffortBlockProps {
  disabled?: boolean
  onChange: (effort: ReasoningEffort) => void
  value: ReasoningEffort
}

export function ReasoningEffortBlock({
  disabled = false,
  onChange,
  value,
}: ReasoningEffortBlockProps) {
  return (
    <section aria-label="Reasoning effort" className="flex items-center">
      <DropdownField
        ariaLabel="Reasoning effort"
        className="w-fit max-w-full"
        fitToContent
        flushOptions
        value={value}
        onChange={(nextValue) => onChange(nextValue as ReasoningEffort)}
        options={REASONING_EFFORT_OPTIONS}
        disabled={disabled}
      />
    </section>
  )
}
