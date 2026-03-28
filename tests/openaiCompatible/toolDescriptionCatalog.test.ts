import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog.ts'

test('tool descriptions include the shared contract and the tool purpose', () => {
  const description = getToolDescription('apply_patch')
  assert.match(description, /Global tool contract:/u)
  assert.match(description, /Treat tool outputs as source of truth\./u)
  assert.match(description, /Apply a structured patch to the workspace using the \*\*\* Begin Patch \/ \*\*\* End Patch format\./u)
  assert.match(description, /Use exact current file text, and include enough surrounding lines to make each hunk unique; if a hunk could match more than one place, add more context before applying it\./u)
})

test('tool descriptions stay short for the per-tool portion', () => {
  const description = getToolDescription('run_terminal')
  assert.equal(description.endsWith('Run a shell command in a managed terminal session.'), true)
})
