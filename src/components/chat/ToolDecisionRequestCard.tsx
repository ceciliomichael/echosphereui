import { useState } from 'react'
import type { ToolDecisionRequest } from '../../types/chat'
import { MarkdownRenderer } from './MarkdownRenderer'

export interface ToolDecisionSubmission {
  customAnswer?: string
  selectedOptionId?: string
}

interface ToolDecisionRequestCardProps {
  onSubmit?: (submission: ToolDecisionSubmission) => void
  request: ToolDecisionRequest
}

export function ToolDecisionRequestCard({ onSubmit, request }: ToolDecisionRequestCardProps) {
  const [customAnswer, setCustomAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = (submission: ToolDecisionSubmission) => {
    if (!onSubmit || submitted) {
      return
    }

    onSubmit(submission)
    setSubmitted(true)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="space-y-3 px-3 py-3">
        <MarkdownRenderer
          content={request.prompt}
          className="text-[13px] text-foreground/90"
          isStreaming={false}
          preserveLineBreaks={false}
        />

        <div className="grid gap-2">
          {request.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={submitted || typeof onSubmit !== 'function'}
              onClick={() => submit({ selectedOptionId: option.id })}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {option.label}
            </button>
          ))}
        </div>

        {request.allowCustomAnswer ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customAnswer}
              disabled={submitted || typeof onSubmit !== 'function'}
              onChange={(event) => setCustomAnswer(event.target.value)}
              placeholder="Enter a custom answer"
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-[13px] text-foreground placeholder:text-muted-foreground/80"
            />
            <button
              type="button"
              disabled={submitted || customAnswer.trim().length === 0 || typeof onSubmit !== 'function'}
              onClick={() => submit({ customAnswer: customAnswer.trim() })}
              className="inline-flex h-10 shrink-0 items-center rounded-xl border border-border px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
