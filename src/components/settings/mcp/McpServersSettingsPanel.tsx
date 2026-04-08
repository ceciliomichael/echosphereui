import { Plus } from 'lucide-react'
import { useState } from 'react'
import { McpAddDialog } from './McpAddDialog'
import { McpServerList } from './McpServerList'
import type { McpAddServerInput, McpState } from '../../../types/mcp'
import { SettingsPanelLayout } from '../shared/SettingsPanelPrimitives'
import { PRIMARY_ACTION_BUTTON_CLASS_NAME } from '../shared/actionButtonStyles'

interface McpServersSettingsPanelProps {
  activeOperation: string | null
  errorMessage: string | null
  isLoading: boolean
  onAddServer: (input: McpAddServerInput) => Promise<boolean>
  onConnectServer: (serverId: string) => Promise<boolean>
  onDisconnectServer: (serverId: string) => Promise<boolean>
  onRemoveServer: (serverId: string) => Promise<boolean>
  onToggleTool: (serverId: string, toolName: string, enabled: boolean) => Promise<boolean>
  state: McpState | null
}

export function McpServersSettingsPanel({
  activeOperation,
  errorMessage,
  isLoading,
  onAddServer,
  onConnectServer,
  onDisconnectServer,
  onRemoveServer,
  onToggleTool,
  state,
}: McpServersSettingsPanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const configs = state?.configs ?? []
  const statuses = state?.statuses ?? {}
  const visibleErrorMessage = errorMessage ?? state?.errorMessage

  async function handleAddServer(input: McpAddServerInput) {
    return onAddServer(input)
  }

  return (
    <SettingsPanelLayout title="MCP Servers">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-6 text-muted-foreground">
              Configure Model Context Protocol servers for the current workspace and connect their tools to the assistant runtime.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddDialogOpen(true)}
            disabled={isLoading}
            className={`${PRIMARY_ACTION_BUTTON_CLASS_NAME} h-11 w-full md:w-auto`}
          >
            <Plus className="h-4 w-4" />
            Add MCP
          </button>
        </div>

        {visibleErrorMessage ? (
          <div className="rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-foreground">
            {visibleErrorMessage}
          </div>
        ) : null}

        <McpServerList
          activeOperation={activeOperation}
          configs={configs}
          onConnect={onConnectServer}
          onDisconnect={onDisconnectServer}
          onRemove={onRemoveServer}
          onToggleTool={onToggleTool}
          statuses={statuses}
        />
      </div>

      {isAddDialogOpen ? (
        <McpAddDialog
          errorMessage={visibleErrorMessage ?? null}
          isSubmitting={activeOperation?.startsWith('add:') ?? false}
          onClose={() => setIsAddDialogOpen(false)}
          onSubmit={async (input) => {
            const didAdd = await handleAddServer(input)
            if (didAdd) {
              setIsAddDialogOpen(false)
            }
            return didAdd
          }}
        />
      ) : null}
    </SettingsPanelLayout>
  )
}
