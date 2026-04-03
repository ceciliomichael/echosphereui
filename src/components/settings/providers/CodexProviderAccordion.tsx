import { Plus, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CodexAccountSummary, CodexProviderConnectionStatus } from '../../../types/chat'
import { ProviderAccordionItem } from './ProviderAccordionItem'

interface CodexProviderAccordionProps {
  activeOperation: string | null
  isBusy: boolean
  isExpanded: boolean
  isFirst?: boolean
  onAddAccount: () => Promise<void>
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onSwitchAccount: (accountId: string) => Promise<void>
  onToggle: () => void
  providerStatus: CodexProviderConnectionStatus | undefined
  primaryButtonClassName: string
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Unavailable'
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function getAccountLabel(account: CodexAccountSummary) {
  return account.label || account.email || account.accountId
}

export function CodexProviderAccordion({
  activeOperation,
  isBusy,
  isExpanded,
  isFirst = false,
  onAddAccount,
  onConnect,
  onDisconnect,
  onSwitchAccount,
  onToggle,
  providerStatus,
  primaryButtonClassName,
}: CodexProviderAccordionProps) {
  const [isActionPending, setIsActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const status = providerStatus
  const isAuthenticated = Boolean(status?.isAuthenticated)
  const activeAccount = status?.accounts.find((account) => account.isActive) ?? null
  const isConnecting = activeOperation === 'codex:connect'
  const isAddingAccount = activeOperation === 'codex:add-account'
  const isDisconnecting = activeOperation === 'codex:disconnect'
  const switchingAccountId = activeOperation?.startsWith('codex:switch:') ? activeOperation.replace('codex:switch:', '') : null
  const statusLabel = isAuthenticated ? 'Connected' : 'Not Connected'
  const resolvedDescription = isAuthenticated
    ? 'Uses the ChatGPT/Codex OAuth session stored in your local auth.json file.'
    : 'Connect your local ChatGPT/Codex OAuth session and use Codex models without an API key.'

  const accountCountLabel = useMemo(() => {
    const totalAccounts = status?.accounts.length ?? 0
    return `${totalAccounts} account${totalAccounts === 1 ? '' : 's'}`
  }, [status?.accounts.length])

  async function runAction(action: () => Promise<void>) {
    setActionError(null)
    setIsActionPending(true)

    try {
      await action()
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0 ? error.message : 'Provider action failed.'
      setActionError(message)
    } finally {
      setIsActionPending(false)
    }
  }

  return (
    <ProviderAccordionItem
      title="Codex"
      description={resolvedDescription}
      statusLabel={statusLabel}
      statusTone={isAuthenticated ? 'active' : 'inactive'}
      isExpanded={isExpanded}
      isFirst={isFirst}
      onToggle={onToggle}
      actions={null}
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Auth File</p>
            <p className="mt-2 break-all text-sm text-foreground">{status?.authFilePath ?? 'Unavailable'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Session</p>
            <div className="mt-2 flex items-start gap-2 text-sm text-foreground">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-foreground" />
              <div className="min-w-0">
                <p className="break-words">{status?.email ?? activeAccount?.email ?? 'No active account detected.'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Expires {formatDateTime(status?.tokenExpiresAt ?? null)}</p>
              </div>
            </div>
          </div>
        </div>

        {isAuthenticated ? (
          <div className="rounded-2xl border border-border bg-surface px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">Accounts</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {accountCountLabel}. Active account is used for Codex chat requests.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void runAction(onAddAccount)}
                disabled={isBusy || isActionPending || isAddingAccount}
                className={primaryButtonClassName}
              >
                {isAddingAccount ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
                Add Account
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {(status?.accounts ?? []).map((account) => {
                const isSwitching = switchingAccountId === account.accountId

                return (
                  <div
                    key={account.accountId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-muted px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{getAccountLabel(account)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account.email ?? account.accountId}
                      </p>
                      {account.usage?.primary ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Primary usage {Math.round(account.usage.primary.usedPercent)}%
                        </p>
                      ) : null}
                    </div>

                    {account.isActive ? (
                      <span className="inline-flex min-h-8 items-center rounded-full border border-accent bg-accent-soft px-3 text-xs font-medium text-accent-foreground">
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runAction(() => onSwitchAccount(account.accountId))}
                        disabled={isBusy || isActionPending || isSwitching}
                        className={primaryButtonClassName}
                      >
                        {isSwitching ? <RefreshCw size={15} className="animate-spin" /> : null}
                        Use Account
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface-muted px-4 py-4 text-sm text-muted-foreground">
            No active Codex session is configured. Connect once and this panel will reflect the contents of your local
            `auth.json`.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Last Refresh</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(status?.lastRefreshAt ?? null)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Account Id</p>
            <p className="mt-2 break-all text-sm text-foreground">{status?.accountId ?? 'Unavailable'}</p>
          </div>
        </div>

        {actionError ? (
          <p className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => void runAction(onDisconnect)}
              disabled={isBusy || isActionPending || isDisconnecting}
              className={primaryButtonClassName}
            >
              <Unplug size={15} />
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runAction(onConnect)}
              disabled={isBusy || isActionPending || isConnecting}
              className={primaryButtonClassName}
            >
              {isConnecting ? <RefreshCw size={15} className="animate-spin" /> : null}
              Connect Codex
            </button>
          )}
        </div>
      </div>
    </ProviderAccordionItem>
  )
}
