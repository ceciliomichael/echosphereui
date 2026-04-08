import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getWorkspaceExplorerContextMenuStyle,
} from '../src/components/workspaceExplorer/workspaceExplorerPanel/workspaceExplorerPanelUtils'
import type { WorkspaceExplorerContextMenuState } from '../src/components/workspaceExplorer/workspaceExplorerPanel/workspaceExplorerPanelTypes'

const contextMenuState = {
  position: {
    x: 120,
    y: 140,
  },
  targetEntry: null,
} satisfies WorkspaceExplorerContextMenuState

test('workspace explorer context menu stays anchored to the click point when there is enough room', () => {
  const style = getWorkspaceExplorerContextMenuStyle(
    contextMenuState,
    {
      height: 600,
      width: 800,
    },
    {
      height: 180,
      width: 210,
    },
  )

  assert.equal(style.left, 120)
  assert.equal(style.top, 140)
  assert.equal(style.maxHeight, '584px')
  assert.equal(style.overflowY, 'auto')
})

test('workspace explorer context menu shifts upward only when it would overflow the viewport', () => {
  const style = getWorkspaceExplorerContextMenuStyle(
    {
      position: {
        x: 120,
        y: 520,
      },
      targetEntry: null,
    },
    {
      height: 600,
      width: 800,
    },
    {
      height: 180,
      width: 210,
    },
  )

  assert.equal(style.left, 120)
  assert.equal(style.top, 412)
})
