import { useMemo } from 'react'
import type { CodexAccountSummary } from '../../../types/chat'
import { DropdownField, type DropdownOption } from '../../ui/DropdownField'

interface CodexAccountDropdownProps {
  accounts: readonly CodexAccountSummary[]
  disabled?: boolean
  onSelect: (accountId: string) => void
}

function getAccountLabel(account: CodexAccountSummary) {
  return account.email ?? account.label ?? account.accountId
}

export function CodexAccountDropdown({ accounts, disabled = false, onSelect }: CodexAccountDropdownProps) {
  const selectedAccountId = useMemo(
    () => accounts.find((account) => account.isActive)?.accountId ?? accounts[0]?.accountId ?? '',
    [accounts],
  )

  const options = useMemo<DropdownOption[]>(
    () =>
      accounts.map((account) => ({
        label: getAccountLabel(account),
        value: account.accountId,
      })),
    [accounts],
  )

  return (
    <DropdownField
      ariaLabel="Codex account"
      className="w-full"
      disabled={disabled || options.length === 0}
      onChange={onSelect}
      options={options}
      value={selectedAccountId}
    />
  )
}
