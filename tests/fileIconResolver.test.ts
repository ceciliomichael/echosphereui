import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFileIconConfig } from '../src/lib/fileIconResolver'

test('resolveFileIconConfig maps SQL files to the database icon', () => {
  const iconConfig = resolveFileIconConfig({ fileName: 'schema.sql' })

  assert.equal(iconConfig.label, 'SQL')
  assert.equal(iconConfig.color, '#f55385')
  assert.equal(iconConfig.icon.name, 'FaDatabase')
})
