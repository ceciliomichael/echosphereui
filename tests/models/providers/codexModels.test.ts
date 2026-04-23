import assert from 'node:assert/strict'
import test from 'node:test'
import { listCodexModels } from '../../../electron/models/providers/codex/models'

test('listCodexModels returns the codex model catalog from models.json', () => {
  const models = listCodexModels()

  assert.ok(models.length > 0)
  assert.deepEqual(
    models.map((model) => model.providerId),
    Array.from({ length: models.length }, () => 'codex'),
  )
  assert.equal(models.find((model) => model.id === 'gpt-5.4')?.enabledByDefault, true)
  assert.equal(models.find((model) => model.id === 'gpt-5.2')?.enabledByDefault, false)
})
