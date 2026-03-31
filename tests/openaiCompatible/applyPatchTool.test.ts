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

test('apply_patch tool can update files in one call', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const updatePath = path.join(workspacePath, 'src', 'update.txt')
    await fs.mkdir(path.dirname(updatePath), { recursive: true })
    await fs.writeFile(updatePath, 'first\nold\nlast\n', 'utf8')

    const result = await applyPatchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          '*** Update File: src/update.txt',
          '@@',
          ' first',
          '-old',
          '+new',
          ' last',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0]?.fileName, 'src/update.txt')
    assert.equal(result.changes[0]?.kind, 'update')
    assert.equal(await fs.readFile(updatePath, 'utf8'), 'first\nnew\nlast\n')
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
    assert.equal(result.changes.length, 1)
    assert.equal(result.changes[0]?.fileName, 'src/notes.txt')
    assert.equal(result.changes[0]?.kind, 'update')
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

test('apply_patch tool rejects add, delete, and move directives', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sourcePath = path.join(workspacePath, 'src', 'old-name.txt')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, 'before\nold\nafter\n', 'utf8')

    await assert.rejects(
      () =>
        applyPatchTool.execute(
          {
            patch: [
              '*** Begin Patch',
              '*** Add File: src/new.txt',
              '+hello',
              '*** End Patch',
            ].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /only supports editing existing files/u)
        return true
      },
    )

    await assert.rejects(
      () =>
        applyPatchTool.execute(
          {
            patch: [
              '*** Begin Patch',
              '*** Delete File: src/old-name.txt',
              '*** End Patch',
            ].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /only supports editing existing files/u)
        return true
      },
    )

    await assert.rejects(
      () =>
        applyPatchTool.execute(
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
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /only supports editing existing files/u)
        return true
      },
    )
  })
})

test('apply_patch tool matches the end of file first when anchored at EOF', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetPath = path.join(workspacePath, 'src', 'footer.txt')
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, 'alpha\nbeta\nalpha\nbeta\n', 'utf8')

    const result = await applyPatchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          '*** Update File: src/footer.txt',
          '@@',
          ' alpha',
          '-beta',
          '+gamma',
          '*** End of File',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(await fs.readFile(targetPath, 'utf8'), 'alpha\nbeta\nalpha\ngamma')
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

test('apply_patch tool does not write partial changes when a later hunk fails', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const keepPath = path.join(workspacePath, 'src', 'keep.txt')
    await fs.mkdir(path.dirname(keepPath), { recursive: true })
    await fs.writeFile(keepPath, 'original\n', 'utf8')

    await assert.rejects(
      () =>
        applyPatchTool.execute(
          {
            patch: [
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
            ].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /Cannot update missing file|Could not find the hunk context/u)
        return true
      },
    )

    assert.equal(await fs.readFile(keepPath, 'utf8'), 'original\n')
  })
})
