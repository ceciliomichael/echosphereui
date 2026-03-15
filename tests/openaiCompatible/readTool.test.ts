import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readTool } from '../../electron/chat/openaiCompatible/tools/readTool'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

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

test('read tool supports explicit start_line and end_line range selection up to 500 lines', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'large.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const fileContent = Array.from({ length: 600 }, (_, index) => `line-${index + 1}`).join('\n')
    await fs.writeFile(filePath, fileContent, 'utf8')

    const result = await readTool.execute(
      {
        absolute_path: filePath,
        end_line: 500,
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

test('read tool rejects ranges larger than 500 lines', async () => {
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
            end_line: 501,
            start_line: 1,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /at most 500 lines/u)
        return true
      },
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

test('read tool rejects start_line values beyond file length', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'small.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['line-1', 'line-2'].join('\n'), 'utf8')

    await assert.rejects(
      () =>
        readTool.execute(
          {
            absolute_path: filePath,
            start_line: 50,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /start_line exceeds file length/u)
        return true
      },
    )
  })
})
