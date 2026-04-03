import { useId } from 'react'
import { useChatInputMetricTooltip } from '../../hooks/useChatInputMetricTooltip'
import type { ContextUsageEstimate } from '../../types/chat'
import { DashedMetricCircle } from './DashedMetricCircle'

interface ContextIndicatorProps {
  disabled?: boolean
  usage: ContextUsageEstimate
}

function formatTokenCount(tokens: number) {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(tokens >= 10_000 ? 0 : 1)}k`
  }

  return tokens.toString()
}

function getUsageColor(usageRatio: number) {
  if (usageRatio >= 0.9) {
    return 'var(--color-danger-foreground)'
  }

  if (usageRatio >= 0.75) {
    return 'color-mix(in srgb, var(--color-danger-foreground) 72%, var(--color-foreground))'
  }

  return 'var(--color-action)'
}

function getEstimatedContextTokens(usage: ContextUsageEstimate) {
  return usage.systemPromptTokens + usage.historyTokens + usage.toolResultsTokens
}

function getEffectiveMaxTokens(usage: ContextUsageEstimate) {
  return usage.maxTokens > 0 ? usage.maxTokens : 200_000
}

function DashedUsageCircle({ usage }: { usage: ContextUsageEstimate }) {
  const estimatedTotalTokens = getEstimatedContextTokens(usage)
  const usageRatio = Math.min(estimatedTotalTokens / getEffectiveMaxTokens(usage), 1)
  const activeColor = getUsageColor(usageRatio)

  return (
    <DashedMetricCircle activeColor={activeColor} inactiveColor="var(--color-border)" percent={usageRatio * 100} size={18} />
  )
}

export function ContextIndicator({ disabled = false, usage }: ContextIndicatorProps) {
  const tooltipId = useId()
  const { buttonRef, containerRef, handleBlur, isOpen, isTopTooltip, openTooltip, scheduleClose, tooltipPosition } =
    useChatInputMetricTooltip({
      disabled,
      hoverKey: 'context',
      minimumTopSpace: 220,
    })
  const estimatedTotalTokens = getEstimatedContextTokens(usage)
  const effectiveMaxTokens = getEffectiveMaxTokens(usage)
  const usageRatio = Math.min(estimatedTotalTokens / effectiveMaxTokens, 1)
  const usagePercent = Math.min(usageRatio, 1) * 100

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={handleBlur}
      onMouseEnter={openTooltip}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-label={`Estimated context usage ${formatTokenCount(estimatedTotalTokens)} of ${formatTokenCount(effectiveMaxTokens)} tokens`}
        className="flex items-center justify-center bg-transparent p-0 text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:cursor-default disabled:opacity-80"
        disabled={disabled}
        onFocus={openTooltip}
      >
        <DashedUsageCircle usage={usage} />
      </button>

      {isOpen ? (
        <div
          id={tooltipId}
          role="tooltip"
          className={[
            'absolute right-0 z-50 w-56 rounded-2xl border border-border bg-surface p-3 text-xs text-foreground shadow-soft',
            tooltipPosition === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
          ].join(' ')}
          style={{ zIndex: isTopTooltip ? 60 : 50 }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">Context estimate</span>
            <span className="inline-flex min-h-5 items-center justify-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium leading-none text-accent-foreground">
              {usagePercent.toFixed(1)}%
            </span>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-subtle-foreground">
              <span>System + tools</span>
              <span className="text-foreground">{formatTokenCount(usage.systemPromptTokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-subtle-foreground">
              <span>Chat history</span>
              <span className="text-foreground">{formatTokenCount(usage.historyTokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-subtle-foreground">
              <span>Tool results</span>
              <span className="text-foreground">{formatTokenCount(usage.toolResultsTokens)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-foreground">
              <span className="font-medium">Total / {formatTokenCount(effectiveMaxTokens)}</span>
              <span className="font-medium">
                {formatTokenCount(estimatedTotalTokens)} / {formatTokenCount(effectiveMaxTokens)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
