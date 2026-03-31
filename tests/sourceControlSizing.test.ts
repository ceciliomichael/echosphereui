import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampSourceControlHistoryHeight,
  getDefaultSourceControlHistoryHeight,
} from '../src/lib/sourceControlSizing'

test('source control history defaults to a 60/40 split when the container is tall enough', () => {
  assert.equal(getDefaultSourceControlHistoryHeight(600), 240)
})

test('source control history default height respects the minimum bounds on short panels', () => {
  assert.equal(getDefaultSourceControlHistoryHeight(220), 140)
})

test('source control history height clamps between the minimum and remaining space', () => {
  assert.equal(clampSourceControlHistoryHeight(20, 600), 140)
  assert.equal(clampSourceControlHistoryHeight(900, 600), 440)
})
