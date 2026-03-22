import assert from 'node:assert/strict'
import test from 'node:test'
import { getVirtualAgentContextDirectoryName } from '../electron/history/virtualAgentContext'

test('virtual agent contexts use an easy VIRT_ prefix', () => {
  const directoryName = getVirtualAgentContextDirectoryName('c3e1e7a4-7d87-4a4d-8e73-1d5e4f0f9a11')

  assert.match(directoryName, /^VIRT_[a-z0-9]+$/u)
  assert.ok(directoryName.startsWith('VIRT_'))
})

test('virtual agent contexts stay distinct per conversation id', () => {
  const first = getVirtualAgentContextDirectoryName('c3e1e7a4-7d87-4a4d-8e73-1d5e4f0f9a11')
  const second = getVirtualAgentContextDirectoryName('7d7e5c6a-a5d1-4f9d-8c59-4f9466a848b0')

  assert.notEqual(first, second)
})

test('virtual agent context names sanitize unexpected characters', () => {
  const directoryName = getVirtualAgentContextDirectoryName('   Thread 42 / alpha   ')

  assert.equal(directoryName, 'VIRT_thread42alph')
})
