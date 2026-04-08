import assert from 'node:assert/strict'
import test from 'node:test'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { McpServerConfig } from '../../src/types/mcp'
import { createMcpToolSetForServer } from '../../electron/mcp/toolAdapter'

test('createMcpToolSetForServer namespaces tools and filters disabled entries', async () => {
  const client = {
    callTool: async ({ arguments: args, name }: { arguments: Record<string, unknown>; name: string }) => ({
      content: [
        {
          text: `${name}:${JSON.stringify(args)}`,
          type: 'text' as const,
        },
      ],
      isError: false,
    }),
  } as unknown as Client

  const config: McpServerConfig = {
    autoConnect: false,
    enabled: true,
    id: 'server-one',
    name: 'server-one',
    source: 'global',
    toolConfiguration: {
      enabled: true,
      disabledTools: ['hidden-tool'],
    },
    type: 'stdio',
  }

  const tools = createMcpToolSetForServer(config, client, [
    {
      inputSchema: {
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
          },
        },
        required: ['query'],
        type: 'object',
      },
      name: 'search',
    },
    {
      inputSchema: {
        additionalProperties: false,
        type: 'object',
      },
      name: 'hidden-tool',
    },
  ])

  assert.ok('mcp_server-one_search' in tools)
  assert.ok(!('mcp_server-one_hidden-tool' in tools))

  const tool = tools['mcp_server-one_search'] as {
    execute: (input: { query: string }) => Promise<{ body?: string; status: string; summary: string }>
  }
  const result = await tool.execute({ query: 'atlas' })

  assert.equal(result.status, 'success')
  assert.equal(result.summary, 'Completed search')
  assert.equal(result.body, 'search:{"query":"atlas"}')
})
