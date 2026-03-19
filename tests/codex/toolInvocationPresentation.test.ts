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

test('getToolInvocationHeaderLabel renders command execution labels', () => {
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
