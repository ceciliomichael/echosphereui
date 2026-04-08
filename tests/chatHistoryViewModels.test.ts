import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversationFolderSummary } from '../src/types/chat'
import { getFolderIdForWorkspacePath, insertFolderSummary, moveFolderSummary } from '../src/hooks/chatHistoryViewModels'

const folderSummaries: ConversationFolderSummary[] = [
  {
    id: 'folder-a',
    name: 'Project Alpha',
    path: 'C:\\Projects\\Alpha',
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'folder-b',
    name: 'Project Beta',
    path: 'D:/work/Beta',
    createdAt: 2,
    updatedAt: 2,
  },
]

test('getFolderIdForWorkspacePath resolves the matching folder id for a workspace path', () => {
  assert.equal(getFolderIdForWorkspacePath(folderSummaries, 'C:/Projects/Alpha'), 'folder-a')
})

test('getFolderIdForWorkspacePath treats path separators and case differences as equivalent', () => {
  assert.equal(getFolderIdForWorkspacePath(folderSummaries, 'd:\\WORK\\beta'), 'folder-b')
})

test('getFolderIdForWorkspacePath returns null for unmatched or empty paths', () => {
  assert.equal(getFolderIdForWorkspacePath(folderSummaries, 'C:/Projects/Gamma'), null)
  assert.equal(getFolderIdForWorkspacePath(folderSummaries, '   '), null)
})

test('insertFolderSummary preserves explicit folder ordering', () => {
  const nextFolders = insertFolderSummary(folderSummaries, {
    id: 'folder-c',
    name: 'Project Gamma',
    path: '/projects/gamma',
    createdAt: 3,
    updatedAt: 3,
  })

  assert.deepEqual(nextFolders.map((folder) => folder.id), ['folder-a', 'folder-b', 'folder-c'])
})

test('moveFolderSummary reorders folders by moving a folder up or down', () => {
  const movedDown = moveFolderSummary(folderSummaries, 'folder-a', 'down')
  assert.deepEqual(movedDown.map((folder) => folder.id), ['folder-b', 'folder-a'])

  const movedUp = moveFolderSummary(folderSummaries, 'folder-b', 'up')
  assert.deepEqual(movedUp.map((folder) => folder.id), ['folder-b', 'folder-a'])
})
