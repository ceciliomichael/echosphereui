import assert from 'node:assert/strict'
import test from 'node:test'
import { resetLaunchOnlyAppSettings } from '../src/hooks/appSettingsLaunchState'
import { DEFAULT_APP_SETTINGS } from '../src/lib/defaultAppSettings'

test('resetLaunchOnlyAppSettings clears terminal visibility while preserving other settings', () => {
  const nextSettings = resetLaunchOnlyAppSettings({
    ...DEFAULT_APP_SETTINGS,
    chatModelId: 'model-a',
    terminalOpenByWorkspace: {
      '__global__': true,
      workspaceA: false,
    },
    terminalPanelHeightsByWorkspace: {
      workspaceA: 320,
    },
  })

  assert.equal(nextSettings.chatModelId, 'model-a')
  assert.deepEqual(nextSettings.terminalOpenByWorkspace, {})
  assert.deepEqual(nextSettings.terminalPanelHeightsByWorkspace, {
    workspaceA: 320,
  })
})
