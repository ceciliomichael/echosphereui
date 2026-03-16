import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldRecoverFromTextOnlyToolTurn } from '../../electron/chat/openaiCompatible/toolRecovery'

test('shouldRecoverFromTextOnlyToolTurn detects explicit pseudo tool-call text', () => {
  assert.equal(shouldRecoverFromTextOnlyToolTurn('functions.edit: {"edits":[...]}'), true)
})

test('shouldRecoverFromTextOnlyToolTurn detects prose tool intent and fake diff summary', () => {
  const proseOutput =
    "I'll add 2 more sections for you. Let me create a Services section and a Team section.\nCreated Services.tsx +54\nNow let me create the Team section:"
  assert.equal(shouldRecoverFromTextOnlyToolTurn(proseOutput), true)
})

test('shouldRecoverFromTextOnlyToolTurn does not trigger for regular explanatory text', () => {
  const explanatoryText =
    'The issue happens because the final chunk ends with stop, so the stream loop exits without another turn.'
  assert.equal(shouldRecoverFromTextOnlyToolTurn(explanatoryText), false)
})
