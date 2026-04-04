import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversationFolderSummary } from '../src/types/chat'
import { getFolderIdForWorkspacePath } from '../src/hooks/chatHistoryViewModels'

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
