import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listTool } from '../../electron/chat/openaiCompatible/tools/listTool'

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

test('list tool returns compact entry shapes without absolute-path metadata', async () => {
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

    assert.equal(result.path, '.')
    assert.deepEqual(entries, [
      { kind: 'file', name: 'package.json' },
      { kind: 'directory', name: 'src' },
    ])
    assert.equal('totalEntries' in result, false)
    assert.equal('ignoredEntriesCount' in result, false)
  })
})
