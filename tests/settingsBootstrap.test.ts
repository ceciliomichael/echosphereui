import assert from 'node:assert/strict'
import test from 'node:test'
import { parseInitialSettingsArg, serializeInitialSettingsArg } from '../electron/settings/bootstrap'
import { DEFAULT_APP_SETTINGS } from '../src/lib/defaultAppSettings'

test('parseInitialSettingsArg sanitizes persisted edit sessions by conversation', () => {
  const parsedSettings = parseInitialSettingsArg([
    'echosphere.exe',
    serializeInitialSettingsArg({
      ...DEFAULT_APP_SETTINGS,
      editSessionsByConversation: {
        ' conversation-a ': { messageId: ' message-a ' },
        '': { messageId: 'message-empty-conversation' },
        'conversation-b': { messageId: '' },
      },
      revertEditSessionsByConversation: {
        ' conversation-c ': { messageId: ' message-c ', redoCheckpointId: ' redo-c ' },
      },
    }),
  ])

  assert.deepEqual(parsedSettings.editSessionsByConversation, {
    'conversation-a': { messageId: 'message-a' },
  })
  assert.deepEqual(parsedSettings.revertEditSessionsByConversation, {
    'conversation-c': { messageId: 'message-c', redoCheckpointId: 'redo-c' },
  })
})

test('parseInitialSettingsArg resets terminal open state on app launch', () => {
  const parsedSettings = parseInitialSettingsArg([
    'echosphere.exe',
    serializeInitialSettingsArg({
      ...DEFAULT_APP_SETTINGS,
      terminalOpenByWorkspace: {
        '__global__': true,
        workspaceA: true,
      },
    }),
  ])

  assert.deepEqual(parsedSettings.terminalOpenByWorkspace, {})
})
