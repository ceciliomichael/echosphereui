import { useEffect, useId, useRef, useState } from 'react'
import type { ContextUsageEstimate } from '../../types/chat'

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

function buildDashPath(size: number, dashIndex: number, dashCount: number) {
  const strokeWidth = 1.5
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const anglePerDash = 360 / dashCount
  const dashArcAngle = anglePerDash * 0.58
  const startAngle = dashIndex * anglePerDash - 90
  const endAngle = startAngle + dashArcAngle
  const startRadians = (startAngle * Math.PI) / 180
  const endRadians = (endAngle * Math.PI) / 180
  const startX = center + radius * Math.cos(startRadians)
  const startY = center + radius * Math.sin(startRadians)
  const endX = center + radius * Math.cos(endRadians)
  const endY = center + radius * Math.sin(endRadians)

  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`
}

function DashedUsageCircle({ usage }: { usage: ContextUsageEstimate }) {
  const size = 18
  const dashCount = 8
  const usageRatio = usage.maxTokens > 0 ? Math.min(usage.totalTokens / usage.maxTokens, 1) : 0
  const activeDashCount = Math.min(dashCount, Math.ceil(usageRatio * dashCount))
  const activeColor = getUsageColor(usageRatio)

  return (
    <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      {Array.from({ length: dashCount }, (_, dashIndex) => {
        const isActive = dashIndex < activeDashCount
        return (
          <path
            key={dashIndex}
            d={buildDashPath(size, dashIndex, dashCount)}
            fill="none"
            stroke={isActive ? activeColor : 'var(--color-border)'}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        )
      })}
    </svg>
  )
}

export function ContextIndicator({ disabled = false, usage }: ContextIndicatorProps) {
  const tooltipId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)
  const usageRatio = usage.maxTokens > 0 ? usage.totalTokens / usage.maxTokens : 0
  const usagePercent = Math.min(usageRatio, 1) * 100

  function clearCloseTimeout() {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  function openTooltip() {
    clearCloseTimeout()
    setIsOpen(true)
  }

  function scheduleClose() {
    clearCloseTimeout()
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false)
      closeTimeoutRef.current = null
    }, 180)
  }

  function closeImmediately() {
    clearCloseTimeout()
    setIsOpen(false)
  }

  useEffect(
    () => () => {
      clearCloseTimeout()
    },
    [],
  )

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          scheduleClose()
        }
      }}
      onMouseEnter={openTooltip}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-label={`Estimated context usage ${formatTokenCount(usage.totalTokens)} of ${formatTokenCount(usage.maxTokens)} tokens`}
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
          className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-2xl border border-border bg-surface p-3 text-xs text-foreground shadow-soft"
          onMouseEnter={openTooltip}
          onMouseLeave={closeImmediately}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">Context estimate</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
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
              <span className="font-medium">Total / 200k</span>
              <span className="font-medium">
                {formatTokenCount(usage.totalTokens)} / {formatTokenCount(usage.maxTokens)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
