import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog.ts'

test('tool descriptions stay literal and compact', () => {
  const description = getToolDescription('apply_patch')
  assert.match(description, /^Use this/u)
  assert.match(description, /legacy patch-style updates/u)
})

test('tool descriptions stay short for each tool', () => {
  const description = getToolDescription('run_terminal')
  assert.match(description, /^Use this when/u)
  assert.match(description, /managed terminal session/u)
})
