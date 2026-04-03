import type { ApiKeyProviderId, ProvidersState, SaveApiKeyProviderInput } from '../../../types/chat'
import { SettingsPanelLayout, SettingsSection } from '../shared/SettingsPanelPrimitives'

interface ProvidersSettingsPanelProps {
  activeOperation: string | null
  errorMessage: string | null
  isLoading: boolean
  onAddCodexAccountWithOAuth: () => Promise<boolean>
  onConnectCodexWithOAuth: () => Promise<boolean>
  onRemoveApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<boolean>
  onRefreshProvidersState: () => Promise<void>
  onSaveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<boolean>
  onSwitchCodexAccount: (accountId: string) => Promise<boolean>
  providersState: ProvidersState | null
}

export function ProvidersSettingsPanel({
  activeOperation,
  errorMessage,
  isLoading,
  onAddCodexAccountWithOAuth,
  onConnectCodexWithOAuth,
  onRemoveApiKeyProvider,
  onRefreshProvidersState,
  onSaveApiKeyProvider,
  onSwitchCodexAccount,
  providersState,
}: ProvidersSettingsPanelProps) {
  void activeOperation
  void errorMessage
  void isLoading
  void onAddCodexAccountWithOAuth
  void onConnectCodexWithOAuth
  void onRemoveApiKeyProvider
  void onRefreshProvidersState
  void onSaveApiKeyProvider
  void onSwitchCodexAccount
  void providersState

  return (
    <SettingsPanelLayout title="Providers">
      <SettingsSection title="Provider Setup">
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          This page has been cleared. Provider configuration will be rebuilt from a new backend implementation.
        </div>
      </SettingsSection>
    </SettingsPanelLayout>
  )
}
