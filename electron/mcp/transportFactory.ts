import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpServerConfig } from '../../src/types/mcp'

function buildInheritedEnvironment(overrides?: Record<string, string>) {
  const environment: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      environment[key] = value
    }
  }

  return {
    ...environment,
    ...(overrides ?? {}),
  }
}

export function createMcpTransport(config: McpServerConfig, workspacePath?: string | null): Transport {
  if (config.type === 'stdio') {
    if (!config.command) {
      throw new Error(`MCP server "${config.name}" is missing a command.`)
    }

    return new StdioClientTransport({
      args: config.args ?? [],
      command: config.command,
      cwd: workspacePath?.trim() || process.cwd(),
      env: buildInheritedEnvironment(config.env),
    })
  }

  if (!config.url) {
    throw new Error(`MCP server "${config.name}" is missing a URL.`)
  }

  const targetUrl = new URL(config.url)
  return new StreamableHTTPClientTransport(targetUrl, {
    requestInit: config.headers ? { headers: config.headers } : undefined,
  })
}
