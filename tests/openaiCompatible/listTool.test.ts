import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listTool } from '../../electron/chat/openaiCompatible/tools/list/index'

interface ListEntry {
  kind: string
  name: string
}

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
  }
}

function readEntries(input: Record<string, unknown>) {
  const entries = input.entries
  assert.ok(Array.isArray(entries), 'entries must be an array.')
  return entries as ListEntry[]
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-list-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('list tool returns compact entry shapes with absolute and display paths separated', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'package.json'), '{}', 'utf8')

    const result = await listTool.execute(
      {
        absolute_path: workspacePath,
      },
      buildExecutionContext(workspacePath),
    )
    const entries = readEntries(result)

    assert.equal(result.absolutePath, workspacePath)
    assert.equal(result.path, '.')
    assert.deepEqual(entries, [
      { kind: 'file', name: 'package.json' },
      { kind: 'directory', name: 'src' },
    ])
    assert.equal('totalEntries' in result, false)
    assert.equal('ignoredEntriesCount' in result, false)
  })
})

test('list tool resolves relative absolute_path inputs against the workspace root', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'package.json'), '{}', 'utf8')

    const result = await listTool.execute(
      {
        absolute_path: '.',
      },
      buildExecutionContext(workspacePath),
    )
    const entries = readEntries(result)

    assert.equal(result.absolutePath, workspacePath)
    assert.equal(result.path, '.')
    assert.deepEqual(entries, [
      { kind: 'file', name: 'package.json' },
      { kind: 'directory', name: 'src' },
    ])
  })
})

test('list tool falls back to a unique nested workspace directory when a relative root lookup misses', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.mkdir(path.join(workspacePath, 'src', 'app'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'src', 'app', 'page.tsx'), 'export default function Page() {}', 'utf8')

    const result = await listTool.execute(
      {
        absolute_path: 'app',
      },
      buildExecutionContext(workspacePath),
    )
    const entries = readEntries(result)

    assert.equal(result.absolutePath, path.join(workspacePath, 'src', 'app'))
    assert.equal(result.path, 'src/app')
    assert.deepEqual(entries, [{ kind: 'file', name: 'page.tsx' }])
  })
})

test('list tool respects nested .gitignore files in descendant directories', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.mkdir(path.join(workspacePath, 'backend', 'src'), { recursive: true })
    await fs.mkdir(path.join(workspacePath, 'frontend', 'src'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, '.gitignore'), 'root-ignored.txt\nbackend/dist/\nfrontend/dist/\n', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'root-ignored.txt'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'visible.txt'), 'visible', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'backend', '.gitignore'), 'src/ignored.ts\n', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'frontend', '.gitignore'), 'src/ignored.ts\n', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'backend', 'src', 'ignored.ts'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'backend', 'src', 'visible.ts'), 'visible', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'frontend', 'src', 'ignored.ts'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'frontend', 'src', 'visible.ts'), 'visible', 'utf8')

    const rootResult = await listTool.execute(
      {
        absolute_path: workspacePath,
      },
      buildExecutionContext(workspacePath),
    )
    const backendResult = await listTool.execute(
      {
        absolute_path: path.join(workspacePath, 'backend'),
      },
      buildExecutionContext(workspacePath),
    )
    const frontendResult = await listTool.execute(
      {
        absolute_path: path.join(workspacePath, 'frontend'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.deepEqual(readEntries(rootResult).map((entry) => entry.name), ['.gitignore', 'backend', 'frontend', 'visible.txt'])
    assert.deepEqual(readEntries(backendResult).map((entry) => entry.name), ['.gitignore', 'src'])
    assert.deepEqual(readEntries(frontendResult).map((entry) => entry.name), ['.gitignore', 'src'])
  })
})
