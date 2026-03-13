import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeGeneratedCommitMessage,
  normalizeGeneratedCommitMessageWithDescription,
} from '../../electron/git/commitMessageFormatting'

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

test('normalizeGeneratedCommitMessageWithDescription always returns subject plus a body description', () => {
  const normalized = normalizeGeneratedCommitMessageWithDescription(
    'fix(sync): keep branch checkout up to date',
    ['electron/git/service.ts'],
  )

  assert.equal(normalized.startsWith('fix(sync): keep branch checkout up to date'), true)
  assert.equal(normalized.includes('\n\n- '), true)
})

test('normalizeGeneratedCommitMessageWithDescription removes merge request wording from the body', () => {
  const normalized = normalizeGeneratedCommitMessageWithDescription(
    [
      'feat(commit): enrich generated commit descriptions',
      '',
      'What:',
      '- Add detail so this is ready for merge request creation',
      '',
      'Why:',
      '- Improves commit quality',
    ].join('\n'),
    ['electron/git/commitMessageGenerator.ts'],
  )

  assert.equal(/merge request/iu.test(normalized), false)
  assert.equal(normalized.includes('\n\n- '), true)
})
