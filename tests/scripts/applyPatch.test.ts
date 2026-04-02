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

test('apply_patch can update existing files', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const updateTarget = path.join(workspacePath, 'src', 'update.txt')
    await fs.mkdir(path.dirname(updateTarget), { recursive: true })
    await fs.writeFile(updateTarget, 'first\nold\nlast\n', 'utf8')

    const updatePatch = [
      '*** Begin Patch',
      '*** Update File: src/update.txt',
      '@@',
      ' first',
      '-old',
      '+new',
      ' last',
      '*** End Patch',
    ].join('\n')

    await applyPatchText(updatePatch, workspacePath)

    assert.equal(await fs.readFile(updateTarget, 'utf8'), 'first\nnew\nlast\n')
  })
})

test('apply_patch rejects add, delete, and move directives', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sourcePath = path.join(workspacePath, 'src', 'old-name.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'before\nold\nafter\n', 'utf8')

    const cases = [
      {
        patch: [
          '*** Begin Patch',
          '*** Add File: src/new.txt',
          '+hello',
          '*** End Patch',
        ].join('\n'),
      },
      {
        patch: [
          '*** Begin Patch',
          '*** Delete File: src/old-name.txt',
          '*** End Patch',
        ].join('\n'),
      },
      {
        patch: [
          '*** Begin Patch',
          '*** Update File: src/old-name.txt',
          '*** Move to: src/new-name.txt',
          '@@',
          ' before',
          '-old',
          '+new',
          ' after',
          '*** End Patch',
        ].join('\n'),
      },
    ]

    for (const { patch } of cases) {
      await assert.rejects(() => applyPatchText(patch, workspacePath), /only supports editing existing files/u)
    }
  })
})

test('apply_patch matches the end of file first when anchored at EOF', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'footer.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'alpha\nbeta\nalpha\nbeta\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/footer.txt',
      '@@',
      ' alpha',
      '-beta',
      '+gamma',
      '*** End of File',
      '*** End Patch',
    ].join('\n')

    await applyPatchText(patch, workspacePath)

    assert.equal(await fs.readFile(targetPath, 'utf8'), 'alpha\nbeta\nalpha\ngamma')
  })
})

test('apply_patch does not write partial changes when a later hunk fails', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const keepPath = path.join(workspacePath, 'src', 'keep.txt')
    await fs.mkdir(path.dirname(keepPath), { recursive: true })
    await fs.writeFile(keepPath, 'original\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/keep.txt',
      '@@',
      ' original',
      '-original',
      '+changed',
      '*** Update File: src/missing.txt',
      '@@',
      ' missing',
      '-value',
      '+new',
      '*** End Patch',
    ].join('\n')

    await assert.rejects(() => applyPatchText(patch, workspacePath), /Cannot update missing file/u)

    assert.equal(await fs.readFile(keepPath, 'utf8'), 'original\n')
  })
})

test('apply_patch exposes diagnostics when a hunk cannot be matched', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'notes.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'alpha\nbeta\ngamma\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/notes.txt',
      '@@',
      ' alpha',
      '-delta',
      '+epsilon',
      '*** End Patch',
    ].join('\n')

    await assert.rejects(
      () => applyPatchText(patch, workspacePath),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /Could not find the hunk context/u)
        assert.ok((error as { details?: Record<string, unknown> }).details)
        const details = (error as { details?: Record<string, unknown> }).details
        assert.equal(details?.filePath, 'src/notes.txt')
        assert.equal(details?.firstContextLineMatchCount, 1)
        assert.match(String(details?.firstContextLineMatchLines ?? ''), /1/u)
        assert.match(String(details?.searchWindowPreview ?? ''), /alpha/u)
        return true
      },
    )
  })
})

test('apply_patch supports lineRanges to constrain matching windows', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'duplicate.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'alpha\nbeta\nalpha\nbeta\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/duplicate.txt',
      '@@',
      ' alpha',
      '-beta',
      '+gamma',
      '*** End Patch',
    ].join('\n')

    await applyPatchText(patch, workspacePath, {
      lineRanges: [{ endLine: 4, path: 'src/duplicate.txt', startLine: 3 }],
    })

    assert.equal(await fs.readFile(targetPath, 'utf8'), 'alpha\nbeta\nalpha\ngamma\n')
  })
})

test('apply_patch strips read-style line prefixes from hunk lines', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'numbered.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'alpha\nbeta\n', 'utf8')

    const patch = [
      '*** Begin Patch',
      '*** Update File: src/numbered.txt',
      '@@',
      ' 1|alpha',
      '-2|beta',
      '+2|gamma',
      '*** End Patch',
    ].join('\n')

    await applyPatchText(patch, workspacePath)

    assert.equal(await fs.readFile(targetPath, 'utf8'), 'alpha\ngamma\n')
  })
})
