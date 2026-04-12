import assert from 'node:assert/strict'
import test from 'node:test'
import type { ToolInvocationTrace } from '../../src/types/chat'
import { buildToolInvocationGroupSummary } from '../../src/components/chat/toolInvocationGrouping'

function createInvocation(toolName: string): ToolInvocationTrace {
  return {
    argumentsText: '{}',
    id: `tool-${toolName}`,
    startedAt: 0,
    state: 'completed',
    toolName,
  }
}

test('buildToolInvocationGroupSummary reports list, search, command, and file counts', () => {
  const summary = buildToolInvocationGroupSummary([
    createInvocation('list'),
    createInvocation('glob'),
    createInvocation('run_terminal'),
    createInvocation('read'),
  ])

  assert.equal(summary, 'Explored 1 list, 1 search, ran 1 command, 1 file')
})

test('buildToolInvocationGroupSummary pluralizes grouped categories', () => {
  const summary = buildToolInvocationGroupSummary([
    createInvocation('grep'),
    createInvocation('search_query'),
    createInvocation('exec_command'),
    createInvocation('read'),
    createInvocation('apply_patch'),
  ])

  assert.equal(summary, 'Explored 2 searches, ran 1 command, 2 files')
})

test('buildToolInvocationGroupSummary aggregates run_terminal and get_terminal_output as commands', () => {
  const summary = buildToolInvocationGroupSummary([
    createInvocation('run_terminal'),
    createInvocation('get_terminal_output'),
  ])

  assert.equal(summary, 'Explored ran 2 commands')
})

test('buildToolInvocationGroupSummary includes uncategorized tools by name', () => {
  const summary = buildToolInvocationGroupSummary([createInvocation('ready_implement')])
  assert.equal(summary, 'Explored 1 ready implement')
})
