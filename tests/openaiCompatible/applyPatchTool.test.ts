import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { applyPatchTool } from '../../electron/chat/openaiCompatible/tools/apply-patch/index'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
    workspaceCheckpointId: null,
  }
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-apply-patch-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('apply_patch tool can add, update, and delete files in one call', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const updatePath = path.join(workspacePath, 'src', 'update.txt')
    const deletePath = path.join(workspacePath, 'src', 'delete.txt')
    await fs.mkdir(path.dirname(updatePath), { recursive: true })
    await fs.writeFile(updatePath, 'first\nold\nlast\n', 'utf8')
    await fs.writeFile(deletePath, 'remove me\n', 'utf8')

    const result = await applyPatchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          '*** Add File: src/new.txt',
          '+hello',
          '+world',
          '*** Update File: src/update.txt',
          '@@',
          ' first',
          '-old',
          '+new',
          ' last',
          '*** Delete File: src/delete.txt',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.deepEqual(result.addedPaths, ['src/new.txt'])
    assert.deepEqual(result.modifiedPaths, ['src/update.txt'])
    assert.deepEqual(result.deletedPaths, ['src/delete.txt'])
    assert.equal(await fs.readFile(path.join(workspacePath, 'src', 'new.txt'), 'utf8'), 'hello\nworld')
    assert.equal(await fs.readFile(updatePath, 'utf8'), 'first\nnew\nlast\n')
    await assert.rejects(fs.stat(deletePath))
  })
})

test('apply_patch tool accepts absolute workspace paths in patch headers', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sourcePath = path.join(workspacePath, 'src', 'notes.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'hello\nold\n', 'utf8')

    const result = await applyPatchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          `*** Update File: ${sourcePath}`,
          '@@',
          ' hello',
          '-old',
          '+new',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.deepEqual(result.modifiedPaths, ['src/notes.txt'])
    assert.equal(await fs.readFile(sourcePath, 'utf8'), 'hello\nnew\n')
  })
})

test('apply_patch tool matches hunk context when indentation differs', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'useAutoScroll.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['function demo() {', '\treturn null', '}'].join('\n'), 'utf8')

    const result = await applyPatchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          `*** Update File: ${filePath}`,
          '@@',
          ' function demo() {',
          '-  return null',
          '+  return <div />',
          ' }',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.equal(await fs.readFile(filePath, 'utf8'), ['function demo() {', '  return <div />', '}'].join('\n'))
  })
})

test('apply_patch tool supports file moves during update', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sourcePath = path.join(workspacePath, 'src', 'old-name.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'before\nold\nafter\n', 'utf8')

    const result = await applyPatchTool.execute(
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
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.deepEqual(result.modifiedPaths, ['src/new-name.txt'])
    await assert.rejects(fs.stat(sourcePath))
    assert.equal(await fs.readFile(path.join(workspacePath, 'src', 'new-name.txt'), 'utf8'), 'before\nnew\nafter\n')
  })
})

test('apply_patch tool rejects malformed patch input', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await assert.rejects(
      () =>
        applyPatchTool.execute(
          {
            patch: '*** Begin Patch\n*** End Patch',
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /at least one file operation/u)
        return true
      },
    )
  })
})

test('apply_patch tool surfaces context diagnostics when a hunk cannot be matched', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'notes.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'alpha\nbeta\ngamma\n', 'utf8')

    await assert.rejects(
      () =>
        applyPatchTool.execute(
          {
            patch: [
              '*** Begin Patch',
              '*** Update File: src/notes.txt',
              '@@',
              ' alpha',
              '-delta',
              '+epsilon',
              '*** End Patch',
            ].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /Could not find the hunk context/u)
        assert.ok(error.details)
        assert.equal(error.details?.filePath, 'src/notes.txt')
        assert.equal(error.details?.firstContextLineMatchCount, 1)
        assert.match(String(error.details?.firstContextLineMatchLines ?? ''), /1/u)
        assert.match(String(error.details?.searchWindowPreview ?? ''), /alpha/u)
        return true
      },
    )
  })
})
