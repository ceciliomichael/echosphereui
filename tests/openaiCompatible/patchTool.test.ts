import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { patchTool } from '../../electron/chat/openaiCompatible/tools/patch/index'
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
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-edit-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('edit tool applies structured patch updates', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'component.tsx')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['function Demo() {', '  return null', '}'].join('\n'), 'utf8')

    const result = await patchTool.execute(
      {
        patch: ['*** Begin Patch', '*** Update File: src/component.tsx', '@@ function Demo() {', '-  return null', '+  return <div />', '*** End Patch'].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.equal(result.contentChanged, true)
    assert.deepEqual(result.modifiedPaths, ['src/component.tsx'])

    const updated = await fs.readFile(filePath, 'utf8')
    assert.match(updated, /return <div \/>/u)
  })
})

test('edit tool supports add, move, and delete in one patch', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sourcePath = path.join(workspacePath, 'src', 'before.ts')
    const deletePath = path.join(workspacePath, 'src', 'remove-me.ts')
    await fs.mkdir(path.dirname(sourcePath), { recursive: true })
    await fs.writeFile(sourcePath, ['export const value = 1', ''].join('\n'), 'utf8')
    await fs.writeFile(deletePath, ['old', ''].join('\n'), 'utf8')

    const result = await patchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          '*** Add File: src/new-file.ts',
          '+export const created = true',
          '*** Update File: src/before.ts',
          '*** Move to: src/after.ts',
          '@@',
          '-export const value = 1',
          '+export const value = 2',
          '*** Delete File: src/remove-me.ts',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    assert.deepEqual(result.addedPaths, ['src/new-file.ts'])
    assert.deepEqual(result.modifiedPaths, ['src/after.ts'])
    assert.deepEqual(result.deletedPaths, ['src/remove-me.ts'])

    const movedContent = await fs.readFile(path.join(workspacePath, 'src', 'after.ts'), 'utf8')
    assert.match(movedContent, /value = 2/u)
    await assert.rejects(() => fs.readFile(sourcePath, 'utf8'))
    await assert.rejects(() => fs.readFile(deletePath, 'utf8'))
  })
})

test('edit tool rejects patches with invalid boundaries', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await assert.rejects(
      () => patchTool.execute({ patch: '*** Update File: src/a.ts' }, buildExecutionContext(workspacePath)),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /first line must be \*\*\* Begin Patch/u)
        return true
      },
    )
  })
})

test('edit tool rejects update hunks that do not match file content', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'no-match.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['const value = 1', ''].join('\n'), 'utf8')

    await assert.rejects(
      () =>
        patchTool.execute(
          {
            patch: [
              '*** Begin Patch',
              '*** Update File: src/no-match.ts',
              '@@',
              '-const value = 999',
              '+const value = 2',
              '*** End Patch',
            ].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /Failed to find expected lines/u)
        return true
      },
    )
  })
})

test('edit tool rejects empty patch body', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await assert.rejects(
      () =>
        patchTool.execute(
          {
            patch: ['*** Begin Patch', '*** End Patch'].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /empty patch/u)
        return true
      },
    )
  })
})

test('edit tool tolerates unprefixed context lines inside update hunks', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'page.tsx')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      [
        'import Hero from "@/components/Hero";',
        'import Footer from "@/components/Footer";',
        '',
        '<Hero />',
        '<Footer />',
        '',
      ].join('\n'),
      'utf8',
    )

    const result = await patchTool.execute(
      {
        patch: [
          '*** Begin Patch',
          '*** Update File: src/page.tsx',
          '@@',
          'import Hero from "@/components/Hero";',
          '+import Testimonials from "@/components/Testimonials";',
          '*** End Patch',
        ].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'apply_patch')
    const updated = await fs.readFile(filePath, 'utf8')
    assert.match(updated, /import Testimonials from "@\/components\/Testimonials";/u)
  })
})
