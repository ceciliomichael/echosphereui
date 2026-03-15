import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execCommandTool } from '../../electron/chat/openaiCompatible/tools/exec-command/index'
import { writeStdinTool } from '../../electron/chat/openaiCompatible/tools/write-stdin/index'
import { clearTerminalSessionsForTests } from '../../electron/chat/openaiCompatible/tools/terminalSessionManager'
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
  if (process.platform === 'win32') {
    return 'Start-Sleep -Seconds 1; Write-Output done'
  }

  return 'sleep 1; echo done'
}

function buildNodeEnvEchoCommand() {
  return `node -p "process.env.NODE_ENV ?? ''"`
}

test('exec_command returns terminal output for a short command', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const result = await execCommandTool.execute(
      {
        cmd: process.platform === 'win32' ? 'Write-Output hello' : 'echo hello',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'exec_command')
    assert.equal(typeof result.output, 'string')
    assert.match(result.output, /hello/u)
    assert.doesNotMatch(result.output, /Chunk ID:/u)
  })
})

test('write_stdin can continue polling an active exec_command session', async () => {
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

    for (let attempt = 0; attempt < 3 && followUpResult.processId !== null; attempt += 1) {
      followUpResult = await writeStdinTool.execute(
        {
          chars: '',
          session_id: followUpResult.processId,
          yield_time_ms: 1_500,
        },
        buildExecutionContext(workspacePath),
      )
      outputChunks.push(followUpResult.output)
    }

    const combinedOutput = outputChunks.join('\n')
    assert.equal(followUpResult.ok, true)
    assert.equal(followUpResult.operation, 'write_stdin')
    assert.equal(followUpResult.processId, null)
    assert.equal(typeof combinedOutput, 'string')
    assert.doesNotMatch(combinedOutput, /Chunk ID:/u)
  })
})

test('write_stdin rejects unknown sessions', async () => {
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

test('exec_command does not inherit parent NODE_ENV by default', async () => {
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
