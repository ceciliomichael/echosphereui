import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog.ts'

test('tool descriptions include the shared contract and the tool purpose', () => {
  const description = getToolDescription('apply_patch')
  assert.match(description, /Global tool contract:/u)
  assert.match(description, /Treat tool outputs as source of truth\./u)
  assert.match(description, /Edit an existing workspace file using the \*\*\* Begin Patch \/ \*\*\* End Patch format\./u)
  assert.match(description, /Only Update File hunks are supported\./u)
  assert.match(description, /How to write a reliable hunk:/u)
  assert.match(description, /Avoid generic anchors like "import \{" or "function"\./u)
  assert.match(description, /Example:/u)
})

test('tool descriptions stay short for the per-tool portion', () => {
  const description = getToolDescription('run_terminal')
  assert.equal(description.endsWith('Run a shell command in a managed terminal session.'), true)
})
