import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execCommandTool } from '../../electron/chat/openaiCompatible/tools/exec-command/index'
import {
  clearTerminalSessionsForTests,
  clampOutputByTokenLimit,
} from '../../electron/chat/openaiCompatible/tools/terminalSessionManager'
import { writeStdinTool } from '../../electron/chat/openaiCompatible/tools/write-stdin/index'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
    streamId: 'test-stream',
    terminalExecutionMode: 'full' as const,
    workspaceCheckpointId: null,
  }
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-terminal-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await clearTerminalSessionsForTests()
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

function buildDelayedCommand() {
  return `node -e "setTimeout(() => console.log('done'), 1000)"`
}

function buildNodeEnvEchoCommand() {
  return `node -p "process.env.NODE_ENV ?? ''"`
}

test('run_terminal returns terminal output for a short command', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const result = await execCommandTool.execute(
      {
        cmd: process.platform === 'win32' ? 'Write-Output hello' : 'echo hello',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'run_terminal')
    assert.equal(typeof result.output, 'string')
    assert.match(result.output, /hello/u)
    assert.doesNotMatch(result.output, /Chunk ID:/u)
  })
})

test('get_terminal_output can continue polling an active run_terminal session', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const initialResult = await execCommandTool.execute(
      {
        cmd: buildDelayedCommand(),
        yield_time_ms: 20,
      },
      buildExecutionContext(workspacePath),
    )
    const outputChunks = [initialResult.output]

    assert.equal(initialResult.ok, true)
    assert.equal(typeof initialResult.processId, 'number')

    let followUpResult = await writeStdinTool.execute(
      {
        chars: '',
        session_id: initialResult.processId,
        yield_time_ms: 2_500,
      },
      buildExecutionContext(workspacePath),
    )

    for (let attempt = 0; attempt < 5 && followUpResult.processId !== null; attempt += 1) {
      followUpResult = await writeStdinTool.execute(
        {
          chars: '',
          session_id: followUpResult.processId,
          yield_time_ms: 2_000,
        },
        buildExecutionContext(workspacePath),
      )
      outputChunks.push(followUpResult.output)
    }

    if (followUpResult.processId !== null) {
      followUpResult = await writeStdinTool.execute(
        {
          chars: '',
          session_id: followUpResult.processId,
          yield_time_ms: 3_000,
        },
        buildExecutionContext(workspacePath),
      )
      outputChunks.push(followUpResult.output)
    }

    const combinedOutput = outputChunks.join('\n')
    assert.equal(followUpResult.ok, true)
    assert.equal(followUpResult.operation, 'get_terminal_output')
    assert.equal(followUpResult.processId, null)
    assert.equal(typeof combinedOutput, 'string')
    assert.doesNotMatch(combinedOutput, /Chunk ID:/u)

    const repeatedResult = await writeStdinTool.execute(
      {
        chars: '',
        session_id: initialResult.processId,
        yield_time_ms: 0,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(repeatedResult.ok, true)
    assert.equal(repeatedResult.operation, 'get_terminal_output')
    assert.equal(repeatedResult.processId, null)
    assert.equal(typeof repeatedResult.output, 'string')
  })
})

test('terminal output truncation preserves the unread tail for the next poll', () => {
  const firstChunk = clampOutputByTokenLimit('0123456789', 1)
  assert.equal(firstChunk.truncated, true)
  assert.equal(firstChunk.consumedLength, 4)
  assert.match(firstChunk.output, /0123/u)
  assert.match(firstChunk.output, /\[output truncated\]/u)

  const secondChunk = clampOutputByTokenLimit('0123456789'.slice(firstChunk.consumedLength), 1)
  assert.equal(secondChunk.truncated, true)
  assert.equal(secondChunk.consumedLength, 4)
  assert.match(secondChunk.output, /4567/u)
  assert.match(secondChunk.output, /\[output truncated\]/u)
})

test('get_terminal_output rejects unknown sessions', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await assert.rejects(
      () =>
        writeStdinTool.execute(
          {
            chars: '',
            session_id: 999_999,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /Unknown terminal session id/u)
        return true
      },
    )
  })
})

test('run_terminal does not inherit parent NODE_ENV by default', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const result = await execCommandTool.execute(
        {
          cmd: buildNodeEnvEchoCommand(),
        },
        buildExecutionContext(workspacePath),
      )

      assert.equal(result.ok, true)
      assert.equal(result.output.trim(), '')
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }
  })
})

test('run_terminal falls back when pwsh shell is requested on Windows', async () => {
  if (process.platform !== 'win32') {
    return
  }

  await withTemporaryDirectory(async (workspacePath) => {
    const result = await execCommandTool.execute(
      {
        cmd: 'node -p "process.version"',
        shell: 'pwsh.exe',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.match(result.output, /^v\d+/u)
  })
})
