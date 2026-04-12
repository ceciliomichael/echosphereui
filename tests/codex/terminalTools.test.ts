import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { WebContents } from 'electron'
import { createAgentTools } from '../../electron/chat/shared/tools'
import { createTerminalToolSet } from '../../electron/chat/shared/tools/terminalTools'

const webContentsStub = {
  id: 42,
  isDestroyed: () => false,
  once: () => undefined,
} as unknown as WebContents

test('run_terminal queues a command and returns the created session metadata', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-terminal-tools-workspace-'))
  const nestedPath = path.join(workspaceRootPath, 'nested')
  await fs.mkdir(nestedPath, { recursive: true })
  const createCalls: Array<{
    cols: number
    cwd?: string
    rows: number
    sessionKey?: string | null
    workspaceRootPath?: string | null
  }> = []
  const writeCalls: Array<{ data: string; sessionId: number }> = []
  try {
    const tools = createTerminalToolSet(
      {
        conversationId: 'conversation-a',
        webContents: webContentsStub,
        workspaceRootPath,
      },
      {
        createSession: async (_owner, input) => {
          createCalls.push(input)
          return {
            bufferedOutput: 'ready\n',
            cwd: nestedPath,
            isReused: false,
            sessionId: 7,
            shell: 'pwsh',
          }
        },
        getSessionOutput: async () => {
          throw new Error('unexpected getSessionOutput call')
        },
        writeToSession: async (_owner, input) => {
          writeCalls.push(input)
        },
      },
    )

    const result = await (
      tools.run_terminal as unknown as {
        execute: (input: {
          cols: number
          command: string
          cwd?: string
          rows: number
          session_key?: string
        }) => Promise<{ body?: string }>
      }
    ).execute({
      cols: 120,
      command: 'npm test',
      cwd: 'nested',
      rows: 30,
      session_key: 'build',
    })

    assert.deepEqual(createCalls, [
      {
        cols: 120,
        cwd: nestedPath,
        rows: 30,
        sessionKey: 'build',
        workspaceRootPath,
      },
    ])
    assert.deepEqual(writeCalls, [
      {
        data: 'npm test\r',
        sessionId: 7,
      },
    ])
    assert.match(result.body ?? '', /╭─<<-- begin terminal session 1 -->>─╮/u)
    assert.match(result.body ?? '', /Started session 1/u)
    assert.match(result.body ?? '', /Command queued: npm test/u)
    assert.match(result.body ?? '', /╰─<<-- end terminal session 1 -->>─╯/u)
    assert.doesNotMatch(result.body ?? '', /CWD:/u)
    assert.doesNotMatch(result.body ?? '', /Shell:/u)
    assert.doesNotMatch(result.body ?? '', /Reused:/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('run_terminal starts at session 1 in a different conversation thread', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-terminal-tools-thread-'))
  try {
    const tools = createTerminalToolSet(
      {
        conversationId: 'conversation-b',
        webContents: webContentsStub,
        workspaceRootPath,
      },
      {
        createSession: async () => ({
          bufferedOutput: '',
          cwd: workspaceRootPath,
          isReused: false,
          sessionId: 8,
          shell: 'pwsh',
        }),
        getSessionOutput: async () => {
          throw new Error('unexpected getSessionOutput call')
        },
        writeToSession: async () => undefined,
      },
    )

    const result = await (
      tools.run_terminal as unknown as {
        execute: (input: {
          cols: number
          command: string
          cwd?: string
          rows: number
          session_key?: string
        }) => Promise<{ body?: string }>
      }
    ).execute({
      cols: 120,
      command: 'npm test',
      cwd: '.',
      rows: 30,
      session_key: 'build',
    })

    assert.match(result.body ?? '', /Started session 1/u)
    assert.match(result.body ?? '', /╭─<<-- begin terminal session 1 -->>─╮/u)
    assert.match(result.body ?? '', /╰─<<-- end terminal session 1 -->>─╯/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('run_terminal increments local session ids sequentially', async () => {
  let nextGlobalSessionId = 30
  const getSessionOutputCalls: Array<{ pollingMs?: number; sessionId: number; workspaceRootPath?: string | null }> = []
  const tools = createTerminalToolSet(
    {
      conversationId: 'conversation-sequential',
      webContents: webContentsStub,
      workspaceRootPath: '/workspace',
    },
    {
      createSession: async () => ({
        bufferedOutput: '',
        cwd: '/workspace',
        isReused: false,
        sessionId: nextGlobalSessionId++,
        shell: 'pwsh',
      }),
      getSessionOutput: async (_owner, input) => {
        getSessionOutputCalls.push(input)
        return {
          cwd: '/workspace',
          exitCode: null,
          hasExited: false,
          outputBuffer: 'global session ' + input.sessionId + '\n',
          shellLabel: 'pwsh',
          signal: null,
          sessionId: input.sessionId,
        }
      },
      writeToSession: async () => undefined,
    },
  )

  const firstRunResult = await (
    tools.run_terminal as unknown as {
      execute: (input: {
        cols: number
        command: string
        cwd?: string
        rows: number
        session_key?: string
      }) => Promise<{ body?: string }>
    }
  ).execute({
    cols: 120,
    command: '',
    cwd: '.',
    rows: 30,
    session_key: 'first',
  })

  const secondRunResult = await (
    tools.run_terminal as unknown as {
      execute: (input: {
        cols: number
        command: string
        cwd?: string
        rows: number
        session_key?: string
      }) => Promise<{ body?: string }>
    }
  ).execute({
    cols: 120,
    command: '',
    cwd: '.',
    rows: 30,
    session_key: 'second',
  })

  const secondOutputResult = await (
    tools.get_terminal_output as unknown as {
      execute: (input: { session_id: number }) => Promise<{ body?: string }>
    }
  ).execute({
    session_id: 2,
  })

  assert.match(firstRunResult.body ?? '', /Started session 1/u)
  assert.match(secondRunResult.body ?? '', /Started session 2/u)
  assert.match(secondOutputResult.body ?? '', /global session 31/u)
  assert.deepEqual(getSessionOutputCalls, [
    {
      pollingMs: 15000,
      sessionId: 31,
      workspaceRootPath: '/workspace',
    },
  ])
})

test('get_terminal_output uses the fixed polling window and returns cleaned output', async () => {
  const getSessionOutputCalls: Array<{ pollingMs?: number; sessionId: number; workspaceRootPath?: string | null }> = []
  const tools = createTerminalToolSet(
    {
      conversationId: 'conversation-c',
      webContents: webContentsStub,
      workspaceRootPath: '/workspace',
    },
    {
      createSession: async () => ({
        bufferedOutput: '',
        cwd: '/workspace',
        isReused: false,
        sessionId: 7,
        shell: 'pwsh',
      }),
      getSessionOutput: async (_owner, input) => {
        getSessionOutputCalls.push(input)
        return {
          cwd: '/workspace',
          exitCode: null,
          hasExited: false,
          outputBuffer: '\u001B[?2004hline 1\u001B[0m\r\n\u001B[32mline 2\u001B[0m\r\n',
          shellLabel: 'pwsh',
          signal: null,
          sessionId: input.sessionId,
        }
      },
      writeToSession: async () => undefined,
    },
  )

  await (
    tools.run_terminal as unknown as {
      execute: (input: {
        cols: number
        command: string
        cwd?: string
        rows: number
        session_key?: string
      }) => Promise<{ body?: string }>
    }
  ).execute({
    cols: 120,
    command: '',
    cwd: '.',
    rows: 30,
    session_key: 'build',
  })

  const result = await (
    tools.get_terminal_output as unknown as {
      execute: (input: { session_id: number }) => Promise<{ body?: string }>
    }
  ).execute({
    session_id: 1,
  })

  assert.deepEqual(getSessionOutputCalls, [
    {
      pollingMs: 15000,
      sessionId: 7,
      workspaceRootPath: '/workspace',
    },
  ])
  assert.match(result.body ?? '', /╭─<<-- begin terminal output session 1 -->>─╮/u)
  assert.match(result.body ?? '', /line 1/u)
  assert.match(result.body ?? '', /line 2/u)
  assert.match(result.body ?? '', /╰─<<-- end terminal output session 1 -->>─╯/u)
  assert.ok(!(result.body ?? '').includes('\u001B'))
  assert.doesNotMatch(result.body ?? '', /CWD:/u)
  assert.doesNotMatch(result.body ?? '', /Shell:/u)
  assert.doesNotMatch(result.body ?? '', /Polling:/u)
})

test('get_terminal_output wraps empty output in a terminal envelope', async () => {
  const tools = createTerminalToolSet(
    {
      conversationId: 'conversation-d',
      webContents: webContentsStub,
      workspaceRootPath: '/workspace',
    },
    {
      createSession: async () => ({
        bufferedOutput: '',
        cwd: '/workspace',
        isReused: false,
        sessionId: 11,
        shell: 'pwsh',
      }),
      getSessionOutput: async (_owner, input) => ({
        cwd: '/workspace',
        exitCode: null,
        hasExited: false,
        outputBuffer: '',
        shellLabel: 'pwsh',
        signal: null,
        sessionId: input.sessionId,
      }),
      writeToSession: async () => undefined,
    },
  )

  await (
    tools.run_terminal as unknown as {
      execute: (input: {
        cols: number
        command: string
        cwd?: string
        rows: number
        session_key?: string
      }) => Promise<{ body?: string }>
    }
  ).execute({
    cols: 120,
    command: '',
    cwd: '.',
    rows: 30,
    session_key: 'build',
  })

  const result = await (
    tools.get_terminal_output as unknown as {
      execute: (input: { session_id: number }) => Promise<{ body?: string }>
    }
  ).execute({
    session_id: 1,
  })

  assert.match(result.body ?? '', /╭─<<-- begin terminal output session 1 -->>─╮/u)
  assert.match(result.body ?? '', /No terminal output yet\./u)
  assert.match(result.body ?? '', /╰─<<-- end terminal output session 1 -->>─╯/u)
})

test('get_terminal_output waits for a parallel run_terminal session creation', async () => {
  let allowSessionCreation: (() => void) | null = null
  const allowSessionCreationPromise = new Promise<void>((resolve) => {
    allowSessionCreation = resolve
  })
  const getSessionOutputCalls: Array<{ pollingMs?: number; sessionId: number; workspaceRootPath?: string | null }> = []
  const tools = createTerminalToolSet(
    {
      conversationId: 'conversation-e',
      webContents: webContentsStub,
      workspaceRootPath: '/workspace',
    },
    {
      createSession: async () => {
        await allowSessionCreationPromise
        return {
          bufferedOutput: '',
          cwd: '/workspace',
          isReused: false,
          sessionId: 19,
          shell: 'pwsh',
        }
      },
      getSessionOutput: async (_owner, input) => {
        getSessionOutputCalls.push(input)
        return {
          cwd: '/workspace',
          exitCode: null,
          hasExited: false,
          outputBuffer: 'parallel output\n',
          shellLabel: 'pwsh',
          signal: null,
          sessionId: input.sessionId,
        }
      },
      writeToSession: async () => undefined,
    },
  )

  const runPromise = (
    tools.run_terminal as unknown as {
      execute: (input: {
        cols: number
        command: string
        cwd?: string
        rows: number
        session_key?: string
      }) => Promise<{ body?: string }>
    }
  ).execute({
    cols: 120,
    command: '',
    cwd: '.',
    rows: 30,
    session_key: 'parallel-build',
  })

  const outputPromise = (
    tools.get_terminal_output as unknown as {
      execute: (input: { session_id: number }) => Promise<{ body?: string }>
    }
  ).execute({
    session_id: 1,
  })

  allowSessionCreation?.()

  const [runResult, outputResult] = await Promise.all([runPromise, outputPromise])

  assert.match(runResult.body ?? '', /Started session 1/u)
  assert.match(outputResult.body ?? '', /parallel output/u)
  assert.deepEqual(getSessionOutputCalls, [
    {
      pollingMs: 15000,
      sessionId: 19,
      workspaceRootPath: '/workspace',
    },
  ])
})

test('get_terminal_output waits when invoked before run_terminal reserves the local session id', async () => {
  let allowSessionCreation: (() => void) | null = null
  const allowSessionCreationPromise = new Promise<void>((resolve) => {
    allowSessionCreation = resolve
  })
  const getSessionOutputCalls: Array<{ pollingMs?: number; sessionId: number; workspaceRootPath?: string | null }> = []
  const tools = createTerminalToolSet(
    {
      conversationId: 'conversation-f',
      webContents: webContentsStub,
      workspaceRootPath: '/workspace',
    },
    {
      createSession: async () => {
        await allowSessionCreationPromise
        return {
          bufferedOutput: '',
          cwd: '/workspace',
          isReused: false,
          sessionId: 21,
          shell: 'pwsh',
        }
      },
      getSessionOutput: async (_owner, input) => {
        getSessionOutputCalls.push(input)
        return {
          cwd: '/workspace',
          exitCode: null,
          hasExited: false,
          outputBuffer: 'pre-registered output\n',
          shellLabel: 'pwsh',
          signal: null,
          sessionId: input.sessionId,
        }
      },
      writeToSession: async () => undefined,
    },
  )

  const outputPromise = (
    tools.get_terminal_output as unknown as {
      execute: (input: { session_id: number }) => Promise<{ body?: string }>
    }
  ).execute({
    session_id: 1,
  })

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 50)
  })

  const runPromise = (
    tools.run_terminal as unknown as {
      execute: (input: {
        cols: number
        command: string
        cwd?: string
        rows: number
        session_key?: string
      }) => Promise<{ body?: string }>
    }
  ).execute({
    cols: 120,
    command: '',
    cwd: '.',
    rows: 30,
    session_key: 'late-start',
  })

  allowSessionCreation?.()

  const [outputResult, runResult] = await Promise.all([outputPromise, runPromise])

  assert.match(runResult.body ?? '', /Started session 1/u)
  assert.match(outputResult.body ?? '', /pre-registered output/u)
  assert.deepEqual(getSessionOutputCalls, [
    {
      pollingMs: 15000,
      sessionId: 21,
      workspaceRootPath: '/workspace',
    },
  ])
})

test('createAgentTools exposes terminal tools only in agent mode when a webContents owner is available', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-terminal-tools-'))

  try {
    const agentTools = await createAgentTools(
      {
        webContents: webContentsStub,
        workspaceRootPath,
      },
      {
        chatMode: 'agent',
      },
    )
    const planTools = await createAgentTools(
      {
        webContents: webContentsStub,
        workspaceRootPath,
      },
      {
        chatMode: 'plan',
      },
    )

    assert.ok('run_terminal' in agentTools)
    assert.ok('get_terminal_output' in agentTools)
    assert.ok(!('run_terminal' in planTools))
    assert.ok(!('get_terminal_output' in planTools))
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})
