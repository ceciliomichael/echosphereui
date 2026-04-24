import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldIgnoreWorkspaceEntry } from '../../electron/workspace/gitignoreMatcher'

test('shouldIgnoreWorkspaceEntry ignores .echosphere by default in workspace mode', () => {
  assert.equal(shouldIgnoreWorkspaceEntry('.echosphere'), true)
  assert.equal(shouldIgnoreWorkspaceEntry('.echosphere', 'workspace'), true)
  assert.equal(shouldIgnoreWorkspaceEntry('.echosphere', 'explorer'), false)
})
