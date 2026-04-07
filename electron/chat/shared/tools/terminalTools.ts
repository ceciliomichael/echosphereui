import type { WebContents } from 'electron'
import { jsonSchema, tool, type ToolSet } from 'ai'
import type {
  CreateTerminalSessionInput,
  CreateTerminalSessionResult,
  TerminalSessionOutputInput,
  WriteTerminalSessionInput,
} from '../../../../src/types/chat'
import type { AgentToolContext, AgentToolExecutionResult } from '../toolTypes'
import type { TerminalSessionSnapshot } from '../../../terminal/service'
import { resolveWorkspaceTargetPath } from './workspaceTools'

const MAX_TERMINAL_OUTPUT_BODY_LENGTH = 20_000
const DEFAULT_TERMINAL_POLLING_MS = 15_000
const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC_PATTERN = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g
const ANSI_SINGLE_ESCAPE_PATTERN = /\u001B[@-Z\\-_]/g
const TERMINAL_CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/g

interface TerminalThreadSessionState {
  globalToLocalSessionId: Map<number, number>
  localToGlobalSessionId: Map<number, number>
  nextSessionId: number
}

const terminalThreadSessionStates = new Map<string, TerminalThreadSessionState>()

interface TerminalToolDependencies {
  createSession: (
    ownerWebContents: WebContents,
    input: CreateTerminalSessionInput,
  ) => Promise<CreateTerminalSessionResult>
  getSessionOutput: (
    ownerWebContents: WebContents,
    input: TerminalSessionOutputInput,
  ) => Promise<TerminalSessionSnapshot>
  writeToSession: (
    ownerWebContents: WebContents,
    input: WriteTerminalSessionInput,
  ) => Promise<void>
}

async function loadDefaultTerminalToolDependencies(): Promise<TerminalToolDependencies> {
  const terminalService = await import('../../../terminal/service')
  return {
    createSession: terminalService.createTerminalSessionForWebContents,
    getSessionOutput: terminalService.getTerminalSessionOutputForWebContents,
    writeToSession: terminalService.writeToTerminalSessionForWebContents,
  }
}

function createSuccessResult(input: Omit<AgentToolExecutionResult, 'status'>): AgentToolExecutionResult {
  return {
    ...input,
    status: 'success',
  }
}

function createErrorResult(summary: string, body?: string): AgentToolExecutionResult {
  return {
    ...(body ? { body } : {}),
    status: 'error',
    summary,
  }
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const boundedValue = Math.floor(value)
  if (boundedValue < min) {
    return min
  }

  if (boundedValue > max) {
    return max
  }

  return boundedValue
}

function truncateTerminalOutput(value: string) {
  if (value.length <= MAX_TERMINAL_OUTPUT_BODY_LENGTH) {
    return {
      body: value,
      truncated: false,
    }
  }

  return {
    body: `${value.slice(0, MAX_TERMINAL_OUTPUT_BODY_LENGTH).trimEnd()}\n\n(Output truncated at ${MAX_TERMINAL_OUTPUT_BODY_LENGTH} characters.)`,
    truncated: true,
  }
}

function sanitizeTerminalOutput(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(ANSI_OSC_PATTERN, '')
    .replace(ANSI_CSI_PATTERN, '')
    .replace(ANSI_SINGLE_ESCAPE_PATTERN, '')
    .replace(TERMINAL_CONTROL_CHARACTER_PATTERN, '')
}

function getSessionIdLabel(sessionId: number) {
  return `session ${sessionId}`
}

function normalizeCommand(command: string | undefined) {
  if (typeof command !== 'string') {
    return null
  }

  const trimmed = command.trim()
  return trimmed.length > 0 ? command : null
}

function resolveTerminalWorkspaceCwd(context: AgentToolContext, cwd: string | undefined) {
  return resolveWorkspaceTargetPath(context.workspaceRootPath, cwd).absolutePath
}

function resolveTerminalThreadNamespace(context: AgentToolContext) {
  const conversationId = context.conversationId?.trim()
  if (conversationId && conversationId.length > 0) {
    return `conversation:${conversationId}`
  }

  return `workspace:${context.workspaceRootPath}`
}

function getTerminalThreadSessionState(namespace: string): TerminalThreadSessionState {
  const existingState = terminalThreadSessionStates.get(namespace)
  if (existingState) {
    return existingState
  }

  const nextState: TerminalThreadSessionState = {
    globalToLocalSessionId: new Map(),
    localToGlobalSessionId: new Map(),
    nextSessionId: 1,
  }
  terminalThreadSessionStates.set(namespace, nextState)
  return nextState
}

function getOrCreateThreadLocalSessionId(namespace: string, globalSessionId: number) {
  const state = getTerminalThreadSessionState(namespace)
  const existingLocalSessionId = state.globalToLocalSessionId.get(globalSessionId)
  if (existingLocalSessionId !== undefined) {
    return existingLocalSessionId
  }

  const localSessionId = state.nextSessionId
  state.nextSessionId += 1
  state.globalToLocalSessionId.set(globalSessionId, localSessionId)
  state.localToGlobalSessionId.set(localSessionId, globalSessionId)
  return localSessionId
}

function resolveThreadGlobalSessionId(namespace: string, localSessionId: number) {
  return getTerminalThreadSessionState(namespace).localToGlobalSessionId.get(localSessionId) ?? null
}

function buildRunTerminalResult(snapshot: CreateTerminalSessionResult, command: string | null) {
  const sanitizedBufferedOutput = sanitizeTerminalOutput(snapshot.bufferedOutput)
  const bodyLines = [`Started ${getSessionIdLabel(snapshot.sessionId)}`]

  if (command) {
    bodyLines.push(`Command queued: ${command.trimEnd()}`)
  }

  if (sanitizedBufferedOutput.trim().length > 0) {
    const output = truncateTerminalOutput(sanitizedBufferedOutput).body
    bodyLines.push('', output)
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    semantics: {
      command,
      session_id: snapshot.sessionId,
    },
    subject: {
      kind: 'session',
      path: String(snapshot.sessionId),
    },
    summary: `Started terminal ${getSessionIdLabel(snapshot.sessionId)}`,
  })
}

function buildGetTerminalOutputResult(snapshot: TerminalSessionSnapshot) {
  const sanitizedOutput = sanitizeTerminalOutput(snapshot.outputBuffer)
  const truncatedOutput = truncateTerminalOutput(sanitizedOutput)
  const bodyLines: string[] = []

  if (truncatedOutput.body.trim().length > 0) {
    bodyLines.push(truncatedOutput.body)
  }

  if (bodyLines.length === 0) {
    bodyLines.push(snapshot.hasExited ? 'Terminal process exited with no output.' : 'No terminal output yet.')
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    semantics: {
      exit_code: snapshot.exitCode,
      has_exited: snapshot.hasExited,
      session_id: snapshot.sessionId,
      signal: snapshot.signal,
      truncated_output: truncatedOutput.truncated,
    },
    subject: {
      kind: 'session',
      path: String(snapshot.sessionId),
    },
    summary: `Fetched output for ${getSessionIdLabel(snapshot.sessionId)}`,
    truncated: truncatedOutput.truncated,
  })
}

export function createTerminalToolSet(
  context: AgentToolContext,
  dependencies: Partial<TerminalToolDependencies> = {},
): ToolSet {
  const ownerWebContents = context.webContents
  if (!ownerWebContents) {
    return {}
  }

  const getResolvedDependencies = async () => {
    if (
      dependencies.createSession !== undefined &&
      dependencies.getSessionOutput !== undefined &&
      dependencies.writeToSession !== undefined
    ) {
      return dependencies as TerminalToolDependencies
    }

    const defaultDependencies = await loadDefaultTerminalToolDependencies()
    return {
      ...defaultDependencies,
      ...dependencies,
    }
  }

  return {
    get_terminal_output: tool({
      description:
        'Fetch the buffered output for an existing workspace-scoped terminal session.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          session_id: {
            minimum: 1,
            type: 'number',
          },
        },
        required: ['session_id'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          session_id: number
        }
        const localSessionId = clampInteger(inputValue.session_id, 1, Number.MAX_SAFE_INTEGER, 1)
        const pollingMs = DEFAULT_TERMINAL_POLLING_MS
        const namespace = resolveTerminalThreadNamespace(context)

        try {
          const globalSessionId = resolveThreadGlobalSessionId(namespace, localSessionId)
          if (globalSessionId === null) {
            return createErrorResult(
              `Unknown terminal session id: ${localSessionId}`,
              `No terminal session with local id ${localSessionId} exists in this thread.`,
            )
          }
          const resolvedDependencies = await getResolvedDependencies()
          const snapshot = await resolvedDependencies.getSessionOutput(ownerWebContents, {
            pollingMs,
            sessionId: globalSessionId,
            workspaceRootPath: context.workspaceRootPath,
          })
          return buildGetTerminalOutputResult(
            {
              ...snapshot,
              sessionId: localSessionId,
            },
          )
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Terminal output fetch failed.',
          )
        }
      },
    }),
    run_terminal: tool({
      description:
        'Create or reuse a terminal session anchored to the active workspace root, optionally queueing an initial command for execution.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          cols: {
            minimum: 20,
            maximum: 400,
            type: 'number',
          },
          command: {
            type: 'string',
          },
          cwd: {
            type: 'string',
          },
          rows: {
            minimum: 6,
            maximum: 200,
            type: 'number',
          },
          session_key: {
            type: 'string',
          },
        },
        required: ['cols', 'rows'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          cols: number
          command?: string
          cwd?: string
          rows: number
          session_key?: string
        }
        const cols = clampInteger(inputValue.cols, 20, 400, 120)
        const rows = clampInteger(inputValue.rows, 6, 200, 30)
        const command = normalizeCommand(inputValue.command)
        const namespace = resolveTerminalThreadNamespace(context)

        try {
          const cwd = resolveTerminalWorkspaceCwd(context, inputValue.cwd)
          const resolvedDependencies = await getResolvedDependencies()
          const session = await resolvedDependencies.createSession(ownerWebContents, {
            cols,
            cwd,
            rows,
            sessionKey: inputValue.session_key,
            workspaceRootPath: context.workspaceRootPath,
          })
          const localSessionId = getOrCreateThreadLocalSessionId(namespace, session.sessionId)
          const displaySession = {
            ...session,
            sessionId: localSessionId,
          }

          if (command) {
            await resolvedDependencies.writeToSession(ownerWebContents, {
              data: command.endsWith('\n') || command.endsWith('\r') ? command : `${command}\r`,
              sessionId: session.sessionId,
            })
          }

          return buildRunTerminalResult(displaySession, command)
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Terminal run failed.',
          )
        }
      },
    }),
  }
}
