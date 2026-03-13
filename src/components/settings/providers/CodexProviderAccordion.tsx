import { ProviderAccordionItem } from './ProviderAccordionItem'
import type { CodexAccountSummary } from '../../../types/chat'
import { CodexAccountsList } from './CodexAccountsList'

interface CodexProviderAccordionProps {
  accountId: string | null
  accounts: CodexAccountSummary[]
  email: string | null
  isAuthenticated: boolean
  isBusy: boolean
  isAddingAccount: boolean
  isConnecting: boolean
  isExpanded: boolean
  isFirst?: boolean
  onAddAccount: () => Promise<void>
  onConnect: () => Promise<void>
  onSwitchAccount: (accountId: string) => Promise<void>
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
  accounts,
  email,
  isAuthenticated,
  isBusy,
  isAddingAccount,
  isConnecting,
  isExpanded,
  isFirst = false,
  onAddAccount,
  onConnect,
  onSwitchAccount,
  onToggle,
  primaryButtonClassName,
}: CodexProviderAccordionProps) {
  return (
    <ProviderAccordionItem
      title={isAuthenticated && email ? email : 'Codex (OAuth)'}
      description={isAuthenticated ? accountId ?? 'Account ID unavailable' : 'Connect Codex and use OAuth-managed access.'}
      statusLabel={isAuthenticated ? 'Connected' : 'Not Configured'}
      statusTone={isAuthenticated ? 'active' : 'inactive'}
      isExpanded={isExpanded}
      isFirst={isFirst}
      onToggle={onToggle}
      actions={
        !isAuthenticated ? (
          <button
            type="button"
            onClick={() => void onConnect()}
            disabled={isBusy}
            className={primaryButtonClassName}
          >
            {getActionLabel(isConnecting)}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onAddAccount()}
            disabled={isBusy}
            className={primaryButtonClassName}
          >
            {isAddingAccount ? 'Adding account...' : 'Add account'}
          </button>
        )
      }
    >
      <CodexAccountsList
        accounts={accounts}
        isBusy={isBusy}
        onSwitchAccount={onSwitchAccount}
      />
    </ProviderAccordionItem>
  )
}
