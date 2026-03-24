import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog'

test('tool descriptions include the shared contract and the tool purpose', () => {
  const description = getToolDescription('write')
  assert.match(description, /Global tool contract:/u)
  assert.match(description, /Treat tool outputs as source of truth\./u)
  assert.match(description, /Write or overwrite a file in the workspace\./u)
})

test('tool descriptions stay short for the per-tool portion', () => {
  const description = getToolDescription('run_terminal')
  assert.equal(description.endsWith('Run a shell command in a managed terminal session.'), true)
})
