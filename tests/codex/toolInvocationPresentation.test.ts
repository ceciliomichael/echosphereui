import assert from 'node:assert/strict'
import test from 'node:test'
import type { ToolInvocationTrace } from '../../src/types/chat'
import { getToolInvocationHeaderLabel } from '../../src/components/chat/toolInvocationPresentation'

function createInvocation(
  overrides: Partial<ToolInvocationTrace> & Pick<ToolInvocationTrace, 'argumentsText' | 'id' | 'state' | 'startedAt' | 'toolName'>,
): ToolInvocationTrace {
  return {
    argumentsText: overrides.argumentsText,
    id: overrides.id,
    startedAt: overrides.startedAt,
    state: overrides.state,
    toolName: overrides.toolName,
    ...overrides,
  }
}

test('getToolInvocationHeaderLabel renders native Codex command execution labels', () => {
  const running = createInvocation({
    argumentsText: '{"command":"npm test"}',
    id: 'cmd-1',
    startedAt: 1_700_000_000_000,
    state: 'running',
    toolName: 'exec_command',
  })
  const completed = createInvocation({
    argumentsText: '{"command":"npm test"}',
    id: 'cmd-1',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'exec_command',
  })

  assert.equal(getToolInvocationHeaderLabel(running), 'Executing npm test')
  assert.equal(getToolInvocationHeaderLabel(completed), 'Executed npm test')
})

test('getToolInvocationHeaderLabel truncates long command execution labels', () => {
  const longCommand = 'node ./scripts/some-really-long-command-name-with-many-arguments --flag-one --flag-two --flag-three --flag-four'
  const invocation = createInvocation({
    argumentsText: JSON.stringify({ command: longCommand }),
    id: 'cmd-long',
    startedAt: 1_700_000_000_000,
    state: 'running',
    toolName: 'exec_command',
  })

  const header = getToolInvocationHeaderLabel(invocation)

  assert.ok(header.startsWith('Executing node ./scripts/some-really-long-command-name-with-many-argume'))
  assert.ok(header.length < `Executing ${longCommand}`.length)
  assert.match(header, /\.\.\.$/u)
})

test('getToolInvocationHeaderLabel renders native Codex file change labels', () => {
  const running = createInvocation({
    argumentsText: '{"changes":[{"path":"src/app.tsx","kind":"update"},{"path":"src/index.ts","kind":"add"}]}',
    id: 'file-1',
    startedAt: 1_700_000_000_000,
    state: 'running',
    toolName: 'file_change',
  })
  const completed = createInvocation({
    argumentsText: '{"changes":[{"path":"src/app.tsx","kind":"update"},{"path":"src/index.ts","kind":"add"}]}',
    id: 'file-1',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'file_change',
  })

  assert.equal(getToolInvocationHeaderLabel(running), 'Applying src/app.tsx, src/index.ts')
  assert.equal(getToolInvocationHeaderLabel(completed), 'Applied src/app.tsx, src/index.ts')
})

test('getToolInvocationHeaderLabel renders native Codex MCP and web search labels', () => {
  const mcpInvocation = createInvocation({
    argumentsText: '{"server":"filesystem","tool":"read","arguments":{"path":"src/index.ts"}}',
    id: 'mcp-1',
    startedAt: 1_700_000_000_000,
    state: 'running',
    toolName: 'mcp_tool_call',
  })
  const webSearchInvocation = createInvocation({
    argumentsText: '{"query":"openai codex sdk"}',
    id: 'web-1',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'web_search',
  })

  assert.equal(getToolInvocationHeaderLabel(mcpInvocation), 'Calling filesystem/read')
  assert.equal(getToolInvocationHeaderLabel(webSearchInvocation), 'Searched openai codex sdk')
})
