import { Calendar, Clock, RefreshCcw } from 'lucide-react'
import type { CodexAccountSummary, CodexUsageWindow } from '../../../types/chat'

interface CodexAccountsListProps {
  accounts: CodexAccountSummary[]
  isBusy: boolean
  onSwitchAccount: (accountId: string) => Promise<void>
}

function formatRemaining(window: CodexUsageWindow | null): string {
  if (!window) {
    return 'n/a'
  }

  const remaining = 100 - window.usedPercent
  return `${Math.round(remaining)}%`
}

function formatReset(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function getUsageDetail(account: CodexAccountSummary): string {
  if (!account.usage) {
    return 'Usage unavailable'
  }

  const primary = account.usage.primary
    ? `5h ${formatRemaining(account.usage.primary)} (${formatReset(account.usage.primary.resetAfterSeconds)})`
    : '5h n/a'
  const secondary = account.usage.secondary
    ? `Week ${formatRemaining(account.usage.secondary)} (${formatReset(account.usage.secondary.resetAfterSeconds)})`
    : 'Week n/a'

  return `${primary} • ${secondary}`
}

export function CodexAccountsList({ accounts, isBusy, onSwitchAccount }: CodexAccountsListProps) {
  if (accounts.length === 0) {
    if (isBusy) {
      return (
        <div className="rounded-xl border border-border bg-background px-3 py-3">
          <p className="text-sm text-muted-foreground">Loading Codex accounts…</p>
        </div>
      )
    }

    return (
      <div className="rounded-xl border border-border bg-background px-3 py-3">
        <p className="text-sm text-muted-foreground">No Codex accounts saved yet.</p>
      </div>
    )
  }

  const switchButtonClassName =
    'group inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent bg-[#101011] px-3.5 text-sm font-medium text-white transition-colors hover:bg-[#1f1f22] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#F5F5F7] dark:text-[#101011] dark:hover:bg-white'

  return (
    <div className="grid gap-3">
      {accounts.map((account) => {
        const usageDetail = getUsageDetail(account)
        const canSwitch = !account.isActive

        return (
          <div
            key={account.accountId}
            className="flex flex-col gap-3 rounded-xl border border-border bg-background px-3 py-3 md:flex-row md:items-start md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">{account.email ?? account.label}</p>
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">{account.accountId}</p>
            </div>

            <div className="flex flex-1 flex-col gap-2 md:items-end">
              <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end" title={usageDetail}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface px-3 text-[11px] font-medium leading-none text-muted-foreground">
                    <Clock size={12} className="shrink-0 text-muted-foreground" />
                    <span>5h {formatRemaining(account.usage?.primary ?? null)}</span>
                  </span>
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface px-3 text-[11px] font-medium leading-none text-muted-foreground">
                    <Calendar size={12} className="shrink-0 text-muted-foreground" />
                    <span>Week {formatRemaining(account.usage?.secondary ?? null)}</span>
                  </span>
                </div>

                {canSwitch ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void onSwitchAccount(account.accountId)}
                    className={switchButtonClassName}
                  >
                    <RefreshCcw
                      size={14}
                      className="shrink-0 text-white transition-colors group-hover:text-white dark:text-[#101011] dark:group-hover:text-[#101011]"
                    />
                    Switch
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
