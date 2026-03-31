import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog.ts'

test('tool descriptions stay literal and compact', () => {
  const description = getToolDescription('apply_patch')
  assert.equal(description, 'Apply a patch to an existing workspace file.')
})

test('tool descriptions stay short for each tool', () => {
  const description = getToolDescription('run_terminal')
  assert.equal(description, 'Run a shell command in a managed terminal session.')
})
