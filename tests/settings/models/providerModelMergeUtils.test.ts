import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeProviderModels } from '../../../src/components/settings/models/providerModelMergeUtils'

test('mergeProviderModels preserves existing models and appends new ones', () => {
  const existingModels = [
    {
      enabledByDefault: true,
      id: 'alpha',
      label: 'Alpha',
      providerId: 'openai-compatible' as const,
      reasoningCapable: false,
    },
  ]
  const incomingModels = [
    {
      enabledByDefault: true,
      id: 'alpha',
      label: 'Alpha updated',
      providerId: 'openai-compatible' as const,
      reasoningCapable: false,
    },
    {
      enabledByDefault: false,
      id: 'beta',
      label: 'Beta',
      providerId: 'openai-compatible' as const,
      reasoningCapable: false,
    },
  ]

  assert.deepEqual(mergeProviderModels(existingModels, incomingModels), [
    {
      enabledByDefault: true,
      id: 'alpha',
      label: 'Alpha',
      providerId: 'openai-compatible',
      reasoningCapable: false,
    },
    {
      enabledByDefault: false,
      id: 'beta',
      label: 'Beta',
      providerId: 'openai-compatible',
      reasoningCapable: false,
    },
  ])
})
