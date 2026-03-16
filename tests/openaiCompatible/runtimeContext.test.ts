import assert from 'node:assert/strict'
import test from 'node:test'
import type { Message } from '../../src/types/chat'
import {
  appendRuntimeContextMessageIfChanged,
  readLatestRuntimeContextSnapshot,
} from '../../electron/chat/agentLoop/runtimeContext'

function createSnapshot() {
  return {
    agentContextRootPath: 'C:/workspace',
    providerId: 'codex' as const,
    terminalExecutionMode: 'sandbox' as const,
  }
}

test('appendRuntimeContextMessageIfChanged appends a synthetic tool_result user message when context changed', () => {
  const messages: Message[] = []
  const result = appendRuntimeContextMessageIfChanged(messages, createSnapshot(), null)

  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].role, 'user')
  assert.equal(result.messages[0].userMessageKind, 'tool_result')
  assert.match(result.messages[0].content, /<context_update>/u)
  assert.ok(result.snapshot)
})

test('appendRuntimeContextMessageIfChanged does not append when snapshot is unchanged', () => {
  const snapshot = createSnapshot()
  const initial = appendRuntimeContextMessageIfChanged([], snapshot, null)
  const next = appendRuntimeContextMessageIfChanged(initial.messages, snapshot, snapshot)

  assert.equal(next.messages.length, initial.messages.length)
  assert.deepEqual(next.snapshot, snapshot)
})

test('readLatestRuntimeContextSnapshot returns the most recent context update in message history', () => {
  const older = appendRuntimeContextMessageIfChanged([], createSnapshot(), null)
  const newerSnapshot = {
    ...createSnapshot(),
    providerId: 'openai-compatible' as const,
  }
  const newer = appendRuntimeContextMessageIfChanged(older.messages, newerSnapshot, older.snapshot)

  const parsed = readLatestRuntimeContextSnapshot(newer.messages)
  assert.deepEqual(parsed, newerSnapshot)
})
