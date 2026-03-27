import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { applyPatchText } from '../../scripts/apply-patch.mjs'

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-apply-patch-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('apply_patch can add, update, and delete files', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const addPatch = [
      '*** Begin Patch',
      '*** Add File: src/new-file.txt',
      '+hello',
      '+world',
      '*** End Patch',
    ].join('\n')

    const updateTarget = path.join(workspacePath, 'src', 'update.txt')
    const deleteTarget = path.join(workspacePath, 'src', 'delete.txt')
    await fs.mkdir(path.dirname(updateTarget), { recursive: true })
    await fs.writeFile(updateTarget, 'first\nold\nlast\n', 'utf8')
    await fs.writeFile(deleteTarget, 'remove me\n', 'utf8')

    const updatePatch = [
      '*** Begin Patch',
      '*** Update File: src/update.txt',
      '@@',
      ' first',
      '-old',
      '+new',
      ' last',
      '*** Delete File: src/delete.txt',
      '*** End Patch',
    ].join('\n')

    await applyPatchText(addPatch, workspacePath)
    await applyPatchText(updatePatch, workspacePath)

    assert.equal(await fs.readFile(path.join(workspacePath, 'src', 'new-file.txt'), 'utf8'), 'hello\nworld')
    assert.equal(await fs.readFile(updateTarget, 'utf8'), 'first\nnew\nlast\n')
    await assert.rejects(fs.stat(deleteTarget))
  })
})

test('apply_patch can move a file during update', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sourcePath = path.join(workspacePath, 'src', 'old-name.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'before\nold\nafter\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/old-name.txt',
      '*** Move to: src/new-name.txt',
      '@@',
      ' before',
      '-old',
      '+new',
      ' after',
      '*** End Patch',
    ].join('\n')

    await applyPatchText(patch, workspacePath)

    await assert.rejects(fs.stat(sourcePath))
    assert.equal(await fs.readFile(path.join(workspacePath, 'src', 'new-name.txt'), 'utf8'), 'before\nnew\nafter\n')
  })
})

test('apply_patch rejects ambiguous update hunks without enough context', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'ambiguous.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'foo\nbar\nfoo\nbar\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/ambiguous.txt',
      '@@',
      ' foo',
      '-bar',
      '+baz',
      '*** End Patch',
    ].join('\n')

    await assert.rejects(() => applyPatchText(patch, workspacePath), /multiple matches/u)
  })
})

