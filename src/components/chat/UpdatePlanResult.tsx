import { Check } from 'lucide-react'
import type { ParsedPlanStep, ParsedUpdatePlanResult } from './updatePlanResultParser'

interface UpdatePlanResultProps {
  parsedResult: ParsedUpdatePlanResult
}

export function UpdatePlanResult({ parsedResult }: UpdatePlanResultProps) {
  const circleBaseClass =
    'inline-flex h-[1.1em] w-[1.1em] shrink-0 items-center justify-center rounded-full border border-black bg-black leading-none text-white dark:border-white dark:bg-white dark:text-black'
  const numberBaseClass = 'text-[0.8em] font-semibold'

  const renderPendingCircle = () => {
    return (
      <span
        className="inline-flex h-[1.1em] w-[1.1em] shrink-0 items-center justify-center rounded-full border border-dashed border-black bg-transparent dark:border-white"
        aria-hidden
      />
    )
  }

  const renderInProgressCircle = (displayLabel: string) => {
    return (
      <span className={circleBaseClass}>
        <span className={numberBaseClass}>{displayLabel}</span>
      </span>
    )
  }

  const renderCompletedCircle = () => {
    return (
      <span className={circleBaseClass}>
        <Check className="h-[0.78em] w-[0.78em] stroke-[3]" />
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
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-4',
                step.status === 'completed' ? 'text-muted-foreground/80' : 'text-foreground/90',
              ].join(' ')}
            >
              <span className="shrink-0">{renderStepCircle(step, String(index + 1))}</span>
              <span className="truncate">{step.status === 'completed' ? `- ${step.title}` : step.title}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
