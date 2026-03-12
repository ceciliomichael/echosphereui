import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readTool } from '../../electron/chat/openaiCompatible/tools/readTool'

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
  }
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-read-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('read tool returns only focused file context fields', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'index.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['one', 'two', 'three'].join('\n'), 'utf8')

    const result = await readTool.execute(
      {
        absolute_path: filePath,
        max_lines: 2,
      },
      buildExecutionContext(workspacePath),
    )

    assert.deepEqual(result, {
      content: 'one\ntwo',
      endLine: 2,
      lineCount: 2,
      ok: true,
      path: 'src/index.ts',
      startLine: 1,
      targetKind: 'file',
      truncated: true,
    })
  })
})
