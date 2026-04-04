import assert from 'node:assert/strict'
import test from 'node:test'
import { getNextChatMode, isChatModeToggleShortcut } from '../../src/components/chat/chatModeShortcut'

test('isChatModeToggleShortcut only matches Ctrl + Period', () => {
  assert.equal(
    isChatModeToggleShortcut({
      altKey: false,
      code: 'Period',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    true,
  )

  assert.equal(
    isChatModeToggleShortcut({
      altKey: false,
      code: 'Period',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }),
    false,
  )

  assert.equal(
    isChatModeToggleShortcut({
      altKey: false,
      code: 'Comma',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    }),
    false,
  )
})

test('getNextChatMode toggles between the available modes', () => {
  const options = [{ value: 'agent' as const }, { value: 'plan' as const }]

  assert.equal(getNextChatMode('agent', options), 'plan')
  assert.equal(getNextChatMode('plan', options), 'agent')
  assert.equal(getNextChatMode('agent', [{ value: 'agent' as const }]), null)
})
