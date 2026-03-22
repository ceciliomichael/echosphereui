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
    toolName: 'run_terminal',
  })
  const completed = createInvocation({
    argumentsText: '{"command":"npm test"}',
    id: 'cmd-1',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'run_terminal',
  })

  assert.equal(getToolInvocationHeaderLabel(running), 'Running npm test')
  assert.equal(getToolInvocationHeaderLabel(completed), 'Ran npm test')
})

test('getToolInvocationHeaderLabel truncates long command execution labels', () => {
  const longCommand = 'node ./scripts/some-really-long-command-name-with-many-arguments --flag-one --flag-two --flag-three --flag-four'
  const invocation = createInvocation({
    argumentsText: JSON.stringify({ command: longCommand }),
    id: 'cmd-long',
    startedAt: 1_700_000_000_000,
    state: 'running',
    toolName: 'run_terminal',
  })

  const header = getToolInvocationHeaderLabel(invocation)

  assert.ok(header.startsWith('Running node ./scripts/some-really-long-command-name-with-many-argume'))
  assert.ok(header.length < `Running ${longCommand}`.length)
  assert.match(header, /\.\.\.$/u)
})

test('getToolInvocationHeaderLabel renders todo write labels without dot target', () => {
  const completed = createInvocation({
    argumentsText: '{"steps":[]}',
    id: 'plan-1',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'todo_write',
    resultContent:
      '<tool_result>\n{"schema":"echosphere.tool_result/v1","status":"success","summary":"ok","toolCallId":"call-1","toolName":"todo_write","subject":{"kind":"path","path":"."}}\n</tool_result>',
  })

  assert.equal(getToolInvocationHeaderLabel(completed), 'Updated Todo List')
})

test('getToolInvocationHeaderLabel renders grep labels with searched query', () => {
  const completed = createInvocation({
    argumentsText: JSON.stringify({ absolute_path: 'C:/repo', pattern: 'Updating Plan' }),
    id: 'grep-1',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'grep',
    resultContent:
      '<tool_result>\n{"schema":"echosphere.tool_result/v1","status":"success","summary":"ok","toolCallId":"call-2","toolName":"grep","subject":{"kind":"path","path":"."}}\n</tool_result>',
  })

  assert.equal(getToolInvocationHeaderLabel(completed), 'Searched Updating Plan')
})

test('getToolInvocationHeaderLabel does not render dot target for exec command without command text', () => {
  const completed = createInvocation({
    argumentsText: '{}',
    id: 'cmd-no-text',
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'run_terminal',
    resultContent:
      '<tool_result>\n{"schema":"echosphere.tool_result/v1","status":"success","summary":"ok","toolCallId":"call-3","toolName":"run_terminal","subject":{"kind":"directory","path":"."}}\n</tool_result>',
  })

  assert.equal(getToolInvocationHeaderLabel(completed), 'Ran')
})
