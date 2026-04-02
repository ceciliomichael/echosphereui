import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolDescription } from '../../electron/chat/openaiCompatible/tools/descriptionCatalog.ts'

test('tool descriptions stay literal and actionable for each tool', () => {
  const description = getToolDescription('run_terminal')
  assert.match(description, /^Use this when/u)
  assert.match(description, /managed terminal session/u)
})

test('list description remains direct and specific', () => {
  const description = getToolDescription('list')
  assert.match(description, /directory tree view/u)
})

test('grep description remains direct and specific', () => {
  const description = getToolDescription('grep')
  assert.match(description, /find content matches/u)
})
