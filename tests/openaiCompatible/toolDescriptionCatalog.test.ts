import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog'

test('edit tool description includes single-operation and anchored replacement guidance', () => {
  const description = getToolDescription('edit')
  assert.match(description, /Provide one edit operation per call/u)
  assert.match(description, /Replace mode: provide `old_string` and `new_string`/u)
  assert.match(description, /Full-write mode: provide `content`/u)
  assert.match(description, /Matching is resilient to line endings, indentation shifts, whitespace differences, and escaped text\./u)
})

test('update_plan tool description includes workflow synchronization guidance', () => {
  const description = getToolDescription('update_plan')
  assert.match(description, /Create or update the active execution plan/u)
  assert.match(description, /Optional `plan`: short plan title/u)
  assert.match(description, /exactly one `in_progress` while work remains/u)
})
