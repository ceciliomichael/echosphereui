import type { McpServerConfig, McpServerStatus } from '../../../types/mcp'
import { McpServerCard } from './McpServerCard'

interface McpServerListProps {
  activeOperation: string | null
  configs: McpServerConfig[]
  onConnect: (serverId: string) => Promise<boolean>
  onDisconnect: (serverId: string) => Promise<boolean>
  onToggleTool: (serverId: string, toolName: string, enabled: boolean) => Promise<boolean>
  statuses: Record<string, McpServerStatus>
}

export function McpServerList({
  activeOperation,
  configs,
  onConnect,
  onDisconnect,
  onToggleTool,
  statuses,
}: McpServerListProps) {
  if (configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-surface px-4 py-12 text-center">
        <p className="text-sm font-medium text-foreground">No MCP servers configured</p>
        <p className="max-w-md text-xs leading-6 text-muted-foreground">
          Click Add MCP to fill out a server entry, then connect it and manage its tools here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {configs.map((config) => (
        <McpServerCard
          key={config.id}
          activeOperation={activeOperation}
          config={config}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onToggleTool={onToggleTool}
          status={statuses[config.id]}
        />
      ))}
    </div>
  )
}
