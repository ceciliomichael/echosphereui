import { Check } from 'lucide-react'
import type { ParsedPlanStep, ParsedUpdatePlanResult } from './updatePlanResultParser'

interface UpdatePlanResultProps {
  parsedResult: ParsedUpdatePlanResult
}

export function UpdatePlanResult({ parsedResult }: UpdatePlanResultProps) {
  const circleBaseClass = 'inline-flex h-5 w-5 shrink-0 items-center justify-center'

  const renderPendingCircle = () => {
    return (
      <span className={`${circleBaseClass} relative`}>
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[#8771FF]/20 blur-[1px] animate-pulse"
        />
        <svg aria-hidden className="relative z-10 h-5 w-5" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8.5" className="fill-[#F3F0FF] stroke-[#8771FF]" strokeWidth="1.25" />
        </svg>
      </span>
    )
  }

  const renderInProgressCircle = (displayLabel: string) => {
    return (
      <span className={`${circleBaseClass} rounded-full bg-[#8771FF] text-[10px] font-semibold text-white shadow-[0_0_0_4px_rgba(135,113,255,0.14)]`}>
        {displayLabel}
      </span>
    )
  }

  const renderCompletedCircle = () => {
    return (
      <span className={`${circleBaseClass} rounded-full bg-[#8771FF] text-white shadow-sm`}>
        <Check className="h-3 w-3 stroke-[3]" />
      </span>
    )
  }

  const renderStepCircle = (step: ParsedPlanStep, displayLabel: string) => {
    if (step.status === 'completed') {
      return renderCompletedCircle()
    }

    if (step.status === 'in_progress') {
      return renderInProgressCircle(displayLabel)
    }

    return renderPendingCircle()
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="px-3 py-2 text-[12px] font-medium text-muted-foreground">{parsedResult.planLabel}</div>
      {parsedResult.steps.length > 0 ? (
        <ul className="border-t border-border bg-surface-muted/60 px-2 py-1">
          {parsedResult.steps.map((step, index) => (
            <li
              key={`${step.idLabel}:${step.title}`}
              className={[
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]',
                step.status === 'completed' ? 'text-muted-foreground/80' : 'text-foreground/90',
              ].join(' ')}
            >
              <span className="shrink-0">{renderStepCircle(step, String(index + 1))}</span>
              <span className="truncate">{step.title}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
