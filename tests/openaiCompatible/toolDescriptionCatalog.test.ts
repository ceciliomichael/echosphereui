import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog'

test('edit tool description includes single-operation and anchored replacement guidance', () => {
  const description = getToolDescription('edit')
  assert.match(description, /Provide one edit operation per call/u)
  assert.match(description, /Replace mode: provide `old_string` and `new_string`/u)
  assert.match(description, /Use `write` when you already know the full final file content\./u)
  assert.match(description, /Matching is resilient to line endings, indentation shifts, whitespace differences, and escaped text\./u)
})

test('todo_write tool description includes task tracking guidance', () => {
  const description = getToolDescription('todo_write')
  assert.match(description, /Track task progress with a concise list\./u)
  assert.match(description, /Call this only when explicit task tracking helps on genuinely larger, branching, or uncertain work\./u)
  assert.match(description, /Skip it for small or linear tasks\./u)
  assert.match(description, /Optional `sessionKey`: short session key for the current todo list/u)
  assert.match(description, /multiple tasks are allowed/u)
})
