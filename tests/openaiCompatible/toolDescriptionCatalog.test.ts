import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog'

test('patch tool description includes strict update-hunk line prefix rules', () => {
  const description = getToolDescription('patch')
  assert.match(description, /every change line must start with exactly one prefix/u)
  assert.match(description, /Never include raw\/unprefixed lines inside update hunks\./u)
  assert.match(description, /Patch preflight: before calling patch/u)
  assert.match(description, /Send only patch text in the patch argument/u)
})
