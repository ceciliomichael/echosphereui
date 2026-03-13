import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGeneratedCommitMessage } from '../../electron/git/commitMessageFormatting'

test('normalizeCommitMessageForTests keeps valid conventional commit subjects intact', () => {
  const normalized = normalizeGeneratedCommitMessage('fix(parser): handle empty commit message generation')
  assert.equal(normalized, 'fix(parser): handle empty commit message generation')
})

test('normalizeCommitMessageForTests strips formatting wrappers and adds fallback prefix', () => {
  const normalized = normalizeGeneratedCommitMessage('"Update commit generation flow"')
  assert.equal(normalized, 'chore: Update commit generation flow')
})

test('normalizeCommitMessageForTests enforces a concise one-line subject', () => {
  const normalized = normalizeGeneratedCommitMessage(
    'feat(editor): implement a very long commit message summary that keeps going past normal subject length limits',
  )

  assert.equal(normalized.length <= 72, true)
  assert.equal(normalized.startsWith('feat(editor):'), true)
  assert.equal(normalized.includes('\n'), false)
})
