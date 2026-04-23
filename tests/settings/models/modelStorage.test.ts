import assert from 'node:assert/strict'
import test from 'node:test'
import { filterEnabledModelCatalogItems } from '../../../src/components/settings/models/modelStorage'

test('filterEnabledModelCatalogItems removes models that are explicitly disabled', () => {
  const models = [
    {
      enabledByDefault: true,
      id: 'enabled-model',
      label: 'Enabled Model',
      providerId: 'openai-compatible' as const,
    },
    {
      enabledByDefault: true,
      id: 'disabled-model',
      label: 'Disabled Model',
      providerId: 'openai-compatible' as const,
    },
  ]

  assert.deepEqual(
    filterEnabledModelCatalogItems(models, {
      'disabled-model': false,
      'enabled-model': true,
    }),
    [models[0]],
  )
})
