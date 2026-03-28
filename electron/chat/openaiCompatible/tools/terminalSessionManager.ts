import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'

const DEFAULT_OUTPUT_TOKEN_LIMIT = 12_000
const MAX_SESSION_OUTPUT_LENGTH = 250_000
const SESSION_RETENTION_MS = 5 * 60 * 1_000

interface TerminalSession {
  child: ChildProcessWithoutNullStreams
  chunkId: string
  consumedLength: number
  createdAt: number
  cwd: string | null
  exitCode: number | null
  exitedAt: number | null
  output: string
  spawnError: string | null
  streamId: string
  waiters: Set<() => void>
}

export interface OpenTerminalSessionInput {
  args: string[]
  command: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  streamId: string
}

export interface PollTerminalSessionInput {
  maxOutputTokens?: number
  sessionId: number
  signal: AbortSignal
  yieldTimeMs: number
}

export interface TerminalSessionPollResult {
  chunkId: string
  cwd: string | null
  exitCode: number | null
  output: string
  originalTokenCount: number
  processId: number | null
  spawnError: string | null
  wallTimeMs: number
}

let nextSessionId = 1
const activeSessions = new Map<number, TerminalSession>()

function estimateTokenCount(text: string) {
  if (text.length === 0) {
    return 0
  }

  return Math.ceil(text.length / 4)
}

function clampOutputByTokenLimit(output: string, maxOutputTokens?: number) {
  const outputTokenLimit =
    typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
      ? Math.floor(maxOutputTokens)
      : DEFAULT_OUTPUT_TOKEN_LIMIT
  const outputCharacterLimit = outputTokenLimit * 4

  if (output.length <= outputCharacterLimit) {
    return output
  }

  const clippedOutput = output.slice(0, outputCharacterLimit)
  return `${clippedOutput}\n\n[output truncated]`
}

function hasUnreadOutput(session: TerminalSession) {
  return session.output.length > session.consumedLength
}

function notifySessionWaiters(session: TerminalSession) {
  for (const notify of session.waiters) {
    notify()
  }

  session.waiters.clear()
}

function appendSessionOutput(session: TerminalSession, chunk: string) {
  if (chunk.length === 0) {
    return
  }

  session.output += chunk
  if (session.output.length > MAX_SESSION_OUTPUT_LENGTH) {
    const excessLength = session.output.length - MAX_SESSION_OUTPUT_LENGTH
    session.output = session.output.slice(excessLength)
    session.consumedLength = Math.max(0, session.consumedLength - excessLength)
  }

  notifySessionWaiters(session)
}

function pruneExpiredSessions() {
  const now = Date.now()
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.exitedAt === null) {
      continue
    }

    if (now - session.exitedAt <= SESSION_RETENTION_MS) {
      continue
    }

    activeSessions.delete(sessionId)
  }
}

function readSessionOutput(session: TerminalSession, maxOutputTokens?: number) {
  const unreadOutput = session.output.slice(session.consumedLength)
  session.consumedLength = session.output.length

  return {
    output: clampOutputByTokenLimit(unreadOutput, maxOutputTokens),
    originalTokenCount: estimateTokenCount(unreadOutput),
  }
}

function waitForSessionActivity(session: TerminalSession, signal: AbortSignal, yieldTimeMs: number) {
  if (signal.aborted) {
    return Promise.reject(new Error('aborted'))
  }

  if (hasUnreadOutput(session) || session.exitedAt !== null) {
    return Promise.resolve()
  }

  const safeYieldMs = Math.max(0, Math.floor(yieldTimeMs))
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup()
      resolve()
    }, safeYieldMs)

    const onAbort = () => {
      cleanup()
      reject(new Error('aborted'))
    }

    const onWake = () => {
      cleanup()
      resolve()
    }

    function cleanup() {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      session.waiters.delete(onWake)
    }

    signal.addEventListener('abort', onAbort, { once: true })
    session.waiters.add(onWake)
  })
}

export function openTerminalSession(input: OpenTerminalSessionInput) {
  pruneExpiredSessions()
  const sessionId = nextSessionId
  nextSessionId += 1

  const spawnOptions: SpawnOptionsWithoutStdio = {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.env ? { env: input.env } : {}),
    shell: false,
    windowsHide: true,
  }
  const child = spawn(input.command, input.args, {
    ...spawnOptions,
    stdio: 'pipe',
  })

  const session: TerminalSession = {
    child,
    chunkId: randomUUID(),
    consumedLength: 0,
    createdAt: Date.now(),
    cwd: input.cwd ?? null,
    exitCode: null,
    exitedAt: null,
    output: '',
    spawnError: null,
    streamId: input.streamId,
    waiters: new Set<() => void>(),
  }

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => appendSessionOutput(session, chunk))
  child.stderr.on('data', (chunk: string) => appendSessionOutput(session, chunk))

  child.on('error', (error) => {
    session.spawnError = error.message
    session.exitCode = session.exitCode ?? 1
    session.exitedAt = session.exitedAt ?? Date.now()
    appendSessionOutput(session, `Failed to start command: ${error.message}\n`)
  })

  child.on('close', (code) => {
    session.exitCode = typeof code === 'number' ? code : session.exitCode ?? 1
    session.exitedAt = Date.now()
    notifySessionWaiters(session)
  })

  activeSessions.set(sessionId, session)
  return sessionId
}

function buildSessionPollResult(
  sessionId: number,
  session: TerminalSession,
  output: string,
  originalTokenCount: number,
): TerminalSessionPollResult {
  return {
    chunkId: session.chunkId,
    cwd: session.cwd,
    exitCode: session.exitCode,
    output,
    originalTokenCount,
    processId: session.exitedAt === null ? sessionId : null,
    spawnError: session.spawnError,
    wallTimeMs: Math.max(0, Date.now() - session.createdAt),
  }
}

export async function pollTerminalSession(input: PollTerminalSessionInput): Promise<TerminalSessionPollResult> {
  pruneExpiredSessions()
  const session = activeSessions.get(input.sessionId)
  if (!session) {
    throw new Error(`Unknown terminal session id: ${input.sessionId}`)
  }

  await waitForSessionActivity(session, input.signal, input.yieldTimeMs)
  const { output, originalTokenCount } = readSessionOutput(session, input.maxOutputTokens)
  return buildSessionPollResult(input.sessionId, session, output, originalTokenCount)
}

export async function writeTerminalSession(
  sessionId: number,
  input: { chars: string; signal: AbortSignal },
) {
  pruneExpiredSessions()
  const session = activeSessions.get(sessionId)
  if (!session) {
    throw new Error(`Unknown terminal session id: ${sessionId}`)
  }

  if (input.signal.aborted) {
    throw new Error('aborted')
  }

  if (session.exitedAt !== null) {
    if (input.chars.trim().length > 0) {
      throw new Error(`Terminal session ${sessionId} has already exited.`)
    }
    return
  }

  if (input.chars.length === 0) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(new Error('aborted'))
    }

    function cleanup() {
      input.signal.removeEventListener('abort', onAbort)
    }

    input.signal.addEventListener('abort', onAbort, { once: true })
    session.child.stdin.write(input.chars, (error) => {
      cleanup()
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

export async function terminateTerminalSession(sessionId: number) {
  const session = activeSessions.get(sessionId)
  if (!session) {
    return
  }

  if (session.exitedAt === null) {
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(resolve, 250)
      session.child.once('close', () => {
        clearTimeout(timeoutId)
        resolve()
      })
      session.child.kill()
    })
  }

  activeSessions.delete(sessionId)
}

export async function terminateTerminalSessionsForStream(streamId: string) {
  const sessionIds: number[] = []

  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.streamId === streamId) {
      sessionIds.push(sessionId)
    }
  }

  await Promise.all(sessionIds.map((sessionId) => terminateTerminalSession(sessionId)))
}

export async function clearTerminalSessionsForTests() {
  const sessionIds = Array.from(activeSessions.keys())
  await Promise.all(sessionIds.map((sessionId) => terminateTerminalSession(sessionId)))
}
