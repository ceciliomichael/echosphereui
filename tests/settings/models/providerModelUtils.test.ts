import assert from 'node:assert/strict'
import test from 'node:test'
import { toProviderModelCatalogItems } from '../../../src/components/settings/models/providerModelUtils'

test('toProviderModelCatalogItems preserves backend default state for provider models', () => {
  const catalogItems = toProviderModelCatalogItems([
    {
      apiModelId: 'codex-a',
      enabledByDefault: true,
      id: 'codex-a',
      label: 'Codex A',
      providerId: 'codex',
      reasoningCapable: true,
    },
    {
      apiModelId: 'openai-compatible-b',
      enabledByDefault: false,
      id: 'openai-compatible-b',
      label: 'OpenAI Compatible B',
      providerId: 'openai-compatible',
      reasoningCapable: false,
    },
  ])

  assert.deepEqual(catalogItems, [
    {
      apiModelId: 'codex-a',
      enabledByDefault: true,
      id: 'codex-a',
      label: 'Codex A',
      providerId: 'codex',
      reasoningCapable: true,
    },
    {
      apiModelId: 'openai-compatible-b',
      enabledByDefault: false,
      id: 'openai-compatible-b',
      label: 'OpenAI Compatible B',
      providerId: 'openai-compatible',
      reasoningCapable: false,
    },
  ])
})
