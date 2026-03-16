import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveForcedToolChoiceForTurn } from '../../electron/chat/openaiCompatible/workflowToolChoice'

test('resolveForcedToolChoiceForTurn keeps auto when no escalation is needed', () => {
  assert.equal(resolveForcedToolChoiceForTurn('auto', false), undefined)
})

test('resolveForcedToolChoiceForTurn escalates auto to required when recovery escalates', () => {
  assert.equal(resolveForcedToolChoiceForTurn('auto', true), 'required')
})

test('resolveForcedToolChoiceForTurn preserves explicit non-auto choices', () => {
  assert.equal(resolveForcedToolChoiceForTurn('required', false), 'required')
  assert.equal(resolveForcedToolChoiceForTurn('none', true), 'none')
})
