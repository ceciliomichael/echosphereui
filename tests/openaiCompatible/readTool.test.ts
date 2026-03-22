import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readTool } from '../../electron/chat/openaiCompatible/tools/read/index'

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
      hasMoreLines: true,
      lineCount: 2,
      maxReadLineCount: 500,
      nextEndLine: 3,
      nextStartLine: 3,
      ok: true,
      path: 'src/index.ts',
      remainingLineCount: 1,
      startLine: 1,
      targetKind: 'file',
      totalLineCount: 3,
      truncated: true,
    })
  })
})

test('read tool supports start_line continuation with max_lines up to 500 lines', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'large.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const fileContent = Array.from({ length: 600 }, (_, index) => `line-${index + 1}`).join('\n')
    await fs.writeFile(filePath, fileContent, 'utf8')

    const result = await readTool.execute(
      {
        absolute_path: filePath,
        max_lines: 500,
        start_line: 1,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.startLine, 1)
    assert.equal(result.endLine, 500)
    assert.equal(result.lineCount, 500)
    assert.equal(result.totalLineCount, 600)
    assert.equal(result.maxReadLineCount, 500)
    assert.equal(result.hasMoreLines, true)
    assert.equal(result.remainingLineCount, 100)
    assert.equal(result.nextStartLine, 501)
    assert.equal(result.nextEndLine, 600)
    assert.equal(result.truncated, true)
    assert.equal(result.content.split('\n')[0], 'line-1')
    assert.equal(result.content.split('\n').at(-1), 'line-500')
  })
})

test('read tool rejects end_line compatibility input', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'large.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const fileContent = Array.from({ length: 600 }, (_, index) => `line-${index + 1}`).join('\n')
    await fs.writeFile(filePath, fileContent, 'utf8')

    await assert.rejects(
      () =>
        readTool.execute(
          {
            absolute_path: filePath,
            end_line: 160,
            start_line: 360,
          },
          buildExecutionContext(workspacePath),
        ),
      /end_line is no longer supported/i,
    )
  })
})

test('read tool rejects max_lines values larger than 500', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'large.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const fileContent = Array.from({ length: 600 }, (_, index) => `line-${index + 1}`).join('\n')
    await fs.writeFile(filePath, fileContent, 'utf8')

    await assert.rejects(
      () =>
        readTool.execute(
          {
            absolute_path: filePath,
            max_lines: 508,
            start_line: 1,
          },
          buildExecutionContext(workspacePath),
        ),
      /max_lines must be less than or equal to 500/i,
    )
  })
})

test('read tool defaults to lines 1-500 when no explicit range is provided', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'default-range.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const fileContent = Array.from({ length: 600 }, (_, index) => `line-${index + 1}`).join('\n')
    await fs.writeFile(filePath, fileContent, 'utf8')

    const result = await readTool.execute(
      {
        absolute_path: filePath,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.startLine, 1)
    assert.equal(result.endLine, 500)
    assert.equal(result.lineCount, 500)
    assert.equal(result.maxReadLineCount, 500)
    assert.equal(result.totalLineCount, 600)
    assert.equal(result.nextStartLine, 501)
    assert.equal(result.nextEndLine, 600)
    assert.equal(result.truncated, true)
  })
})

test('read tool returns empty content when start_line exceeds file length', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'small.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['line-1', 'line-2'].join('\n'), 'utf8')

    const result = await readTool.execute(
      {
        absolute_path: filePath,
        start_line: 50,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.content, '')
    assert.equal(result.lineCount, 0)
    assert.equal(result.startLine, 50)
    assert.equal(result.endLine, 49)
    assert.equal(result.totalLineCount, 2)
    assert.equal(result.hasMoreLines, false)
    assert.equal(result.truncated, false)
    assert.equal(result.nextStartLine, null)
    assert.equal(result.nextEndLine, null)
  })
})
