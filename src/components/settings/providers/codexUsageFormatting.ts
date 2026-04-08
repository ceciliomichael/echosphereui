import type { CodexUsageSnapshot, CodexUsageWindow } from '../../../types/chat'

export interface CodexUsageSummaryItem {
  label: '5h' | 'Week'
  remainingPercent: number
  resetAfterSeconds: number
  windowKind: 'primary' | 'secondary'
}

export function buildCodexUsageSummaryItems(snapshot: CodexUsageSnapshot | null): CodexUsageSummaryItem[] {
  if (!snapshot) {
    return []
  }

  if (snapshot.secondary) {
    const items: CodexUsageSummaryItem[] = []

    if (snapshot.primary) {
      items.push({
        label: '5h',
        remainingPercent: formatRemainingPercent(snapshot.primary),
        resetAfterSeconds: snapshot.primary.resetAfterSeconds,
        windowKind: 'primary',
      })
    }

    items.push({
      label: 'Week',
      remainingPercent: formatRemainingPercent(snapshot.secondary),
      resetAfterSeconds: snapshot.secondary.resetAfterSeconds,
      windowKind: 'secondary',
    })

    return items
  }

  if (snapshot.primary) {
    return [
      {
        label: 'Week',
        remainingPercent: formatRemainingPercent(snapshot.primary),
        resetAfterSeconds: snapshot.primary.resetAfterSeconds,
        windowKind: 'primary',
      },
    ]
  }

  return []
}

export function formatCodexUsageResetCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function formatRemainingPercent(window: CodexUsageWindow): number {
  const remaining = 100 - window.usedPercent
  return Math.max(0, Math.min(100, Math.round(remaining)))
}
