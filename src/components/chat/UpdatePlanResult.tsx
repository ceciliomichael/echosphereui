import { Check } from 'lucide-react'

interface ParsedPlanStep {
  idLabel: string
  status: string
  title: string
}

interface ParsedUpdatePlanResult {
  planLabel: string
  steps: ParsedPlanStep[]
}

export function parseUpdatePlanResultBody(body: string): ParsedUpdatePlanResult | null {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) {
    return null
  }

  const steps: ParsedPlanStep[] = []
  for (const line of lines.slice(1)) {
    if (line.toLowerCase().startsWith('all plan steps')) {
      continue
    }

    const match = line.match(/^([^.\s]+)\.\s+\[([^\]]+)\]\s+(.+)$/u)
    if (!match) {
      continue
    }

    steps.push({
      idLabel: match[1],
      status: match[2],
      title: match[3],
    })
  }

  return {
    planLabel: lines[0],
    steps,
  }
}

interface UpdatePlanResultProps {
  parsedResult: ParsedUpdatePlanResult
}

export function UpdatePlanResult({ parsedResult }: UpdatePlanResultProps) {
  const circleBaseClass = 'inline-flex h-5 w-5 shrink-0 items-center justify-center'

  const renderNumberCircle = (displayLabel: string, style: 'active' | 'pending') => {
    const textClass = style === 'active' ? 'text-background' : 'text-muted-foreground/85'
    const circleClass = style === 'active' ? 'stroke-border fill-foreground' : 'stroke-border fill-transparent'
    const dashProps = style === 'pending' ? { strokeDasharray: '3 2' } : {}

    return (
      <span className={circleBaseClass}>
        <svg aria-hidden className="h-5 w-5" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="9" className={circleClass} strokeWidth="1" {...dashProps} />
          <text
            x="10"
            y="10"
            textAnchor="middle"
            dominantBaseline="middle"
            dy="0.7"
            className={`fill-current font-sans text-[10px] font-medium leading-none ${textClass}`}
          >
            {style === 'active' ? displayLabel : ''}
          </text>
        </svg>
      </span>
    )
  }

  const renderStepCircle = (step: ParsedPlanStep, displayLabel: string) => {
    if (step.status === 'completed') {
      return (
        <span className={`${circleBaseClass} rounded-full border border-border bg-foreground text-background`}>
          <Check className="h-3 w-3" />
        </span>
      )
    }

    if (step.status === 'in_progress') {
      return renderNumberCircle(displayLabel, 'active')
    }

    return renderNumberCircle(displayLabel, 'pending')
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
