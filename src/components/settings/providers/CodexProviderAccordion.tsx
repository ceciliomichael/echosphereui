import { ProviderAccordionItem } from './ProviderAccordionItem'

interface CodexProviderAccordionProps {
  accountId: string | null
  email: string | null
  isAuthenticated: boolean
  isBusy: boolean
  isConnecting: boolean
  isExpanded: boolean
  isFirst?: boolean
  onAction: () => Promise<void>
  onToggle: () => void
  primaryButtonClassName: string
}

function getActionLabel(isConnecting: boolean) {
  if (isConnecting) {
    return 'Waiting for OAuth...'
  }

  return 'Connect with OAuth'
}

export function CodexProviderAccordion({
  accountId,
  email,
  isAuthenticated,
  isBusy,
  isConnecting,
  isExpanded,
  isFirst = false,
  onAction,
  onToggle,
  primaryButtonClassName,
}: CodexProviderAccordionProps) {
  return (
    <ProviderAccordionItem
      title="Codex (OAuth)"
      description="Connect Codex and use OAuth-managed access."
      statusLabel={isAuthenticated ? 'Connected' : 'Not Configured'}
      statusTone={isAuthenticated ? 'active' : 'inactive'}
      isExpanded={isExpanded}
      isFirst={isFirst}
      onToggle={onToggle}
      actions={
        !isAuthenticated ? (
          <button
            type="button"
            onClick={() => void onAction()}
            disabled={isBusy}
            className={primaryButtonClassName}
          >
            {getActionLabel(isConnecting)}
          </button>
        ) : null
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Account ID</p>
          <p className="mt-1 break-all text-sm text-foreground">{accountId ?? 'Not connected'}</p>
        </div>
        <div className="rounded-xl border border-border bg-background px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">Email</p>
          <p className="mt-1 break-all text-sm text-foreground">{email ?? 'Not connected'}</p>
        </div>
      </div>
    </ProviderAccordionItem>
  )
}
