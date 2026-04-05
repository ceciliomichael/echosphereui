import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getProviderModelLoadErrorMessage,
  shouldSuppressProviderModelLoadError,
} from '../../../src/components/settings/models/modelLoadErrorUtils'

test('suppresses remote provider fetch failures from the models settings UI', () => {
  const error = new Error("Error invoking remote method 'models:provider:list': TypeError: fetch failed")

  assert.equal(shouldSuppressProviderModelLoadError(error), true)
  assert.equal(getProviderModelLoadErrorMessage(error), null)
})

test('falls back to a generic error message for unexpected model load failures', () => {
  const error = new Error('Unexpected model load failure')

  assert.equal(shouldSuppressProviderModelLoadError(error), false)
  assert.equal(getProviderModelLoadErrorMessage(error), 'Unexpected model load failure')
})
