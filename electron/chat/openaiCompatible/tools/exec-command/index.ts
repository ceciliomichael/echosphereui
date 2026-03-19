import path from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type { AppTerminalExecutionMode } from '../../../../../src/types/chat'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { getToolDescription } from '../descriptionCatalog'
import { parseToolArguments, readRequiredText } from '../filesystemToolUtils'
import { openTerminalSession, pollTerminalSession } from '../terminalSessionManager'
import {
  DEFAULT_EXEC_COMMAND_YIELD_TIME_MS,
  formatTerminalToolOutput,
  readOptionalBooleanValue,
  readOptionalNonNegativeIntegerValue,
  readOptionalPositiveIntegerValue,
  readOptionalStringValue,
  resolveTerminalWorkingDirectory,
  toTerminalWorkingDirectoryDisplayPath,
} from '../terminalToolSupport'

interface SpawnSpec {
  args: string[]
  command: string
  cwd?: string
}

let wslAvailabilityPromise: Promise<boolean> | null = null
const STRIPPED_TERMINAL_ENV_KEYS = new Set(['NODE_ENV'])
const TOOL_DESCRIPTION = getToolDescription('exec_command')

function createTerminalEnvironment() {
  const environment = { ...process.env }
  for (const envKey of STRIPPED_TERMINAL_ENV_KEYS) {
    delete environment[envKey]
  }

  return environment
}

function isPowerShellShell(shellPath: string) {
  const shellName = path.basename(shellPath).toLowerCase()
  return shellName === 'powershell' || shellName === 'powershell.exe' || shellName === 'pwsh' || shellName === 'pwsh.exe'
}

function isCmdShell(shellPath: string) {
  const shellName = path.basename(shellPath).toLowerCase()
  return shellName === 'cmd' || shellName === 'cmd.exe'
}

function resolveWindowsShellPath(shellPath: string | undefined) {
  const windowsDirectory = process.env.WINDIR?.trim() || 'C:\\Windows'
  const windowsPowerShellPath = path.join(windowsDirectory, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const shellName = shellPath ? path.basename(shellPath).toLowerCase() : null

  if (shellPath && existsSync(shellPath)) {
    return shellPath
  }

  if (shellName === 'pwsh' || shellName === 'pwsh.exe') {
    if (existsSync(windowsPowerShellPath)) {
      return windowsPowerShellPath
    }

    return 'powershell.exe'
  }

  if (shellName === 'powershell' || shellName === 'powershell.exe') {
    if (existsSync(windowsPowerShellPath)) {
      return windowsPowerShellPath
    }

    return 'powershell.exe'
  }

  if (shellName === 'cmd' || shellName === 'cmd.exe') {
    return process.env.ComSpec?.trim() || 'cmd.exe'
  }

  if (existsSync(windowsPowerShellPath)) {
    return windowsPowerShellPath
  }

  return process.env.ComSpec?.trim() || 'cmd.exe'
}

function toWslPath(inputPath: string) {
  const normalizedPath = inputPath.replace(/\\/g, '/')
  const drivePathMatch = normalizedPath.match(/^([a-zA-Z]):\/(.*)$/u)
  if (!drivePathMatch) {
    return normalizedPath
  }

  const driveLetter = drivePathMatch[1].toLowerCase()
  const relativePath = drivePathMatch[2]
  return relativePath.length > 0 ? `/mnt/${driveLetter}/${relativePath}` : `/mnt/${driveLetter}`
}

async function isWslAvailable() {
  if (process.platform !== 'win32') {
    return true
  }

  if (wslAvailabilityPromise === null) {
    wslAvailabilityPromise = new Promise<boolean>((resolve) => {
      const child = spawn('wsl.exe', ['--status'], {
        shell: false,
        stdio: 'ignore',
        windowsHide: true,
      })

      child.once('error', (error) => {
        const errorCode = (error as NodeJS.ErrnoException).code
        resolve(errorCode !== 'ENOENT')
      })

      child.once('close', () => {
        resolve(true)
      })
    })
  }

  return wslAvailabilityPromise
}

function resolveFullModeSpawnSpec(input: { cmd: string; cwd: string; login: boolean; shell?: string }): SpawnSpec {
  if (process.platform === 'win32') {
    const shellPath = resolveWindowsShellPath(input.shell)

    if (isPowerShellShell(shellPath)) {
      const powerShellArguments = input.login
        ? ['-NoLogo', '-Command', input.cmd]
        : ['-NoLogo', '-NoProfile', '-Command', input.cmd]
      return {
        args: powerShellArguments,
        command: shellPath,
        cwd: input.cwd,
      }
    }

    if (isCmdShell(shellPath)) {
      return {
        args: ['/d', '/s', '/c', input.cmd],
        command: shellPath,
        cwd: input.cwd,
      }
    }

    return {
      args: [input.login ? '-lc' : '-c', input.cmd],
      command: shellPath,
      cwd: input.cwd,
    }
  }

  const shellPath = input.shell ?? process.env.SHELL ?? '/bin/bash'
  return {
    args: [input.login ? '-lc' : '-c', input.cmd],
    command: shellPath,
    cwd: input.cwd,
  }
}

async function resolveSpawnSpec(input: {
  cmd: string
  cwd: string
  login: boolean
  mode: AppTerminalExecutionMode
  shell?: string
}): Promise<SpawnSpec> {
  if (input.mode !== 'sandbox') {
    return resolveFullModeSpawnSpec(input)
  }

  if (process.platform === 'win32') {
    if (!(await isWslAvailable())) {
      throw new OpenAICompatibleToolError(
        'Sandbox mode requires WSL, but wsl.exe is not available. Install and initialize WSL first, or switch to Full mode.',
      )
    }

    return {
      args: ['--cd', toWslPath(input.cwd), '--', 'bash', input.login ? '-lc' : '-c', input.cmd],
      command: 'wsl.exe',
    }
  }

  return {
    args: [input.login ? '-lc' : '-c', input.cmd],
    command: '/bin/bash',
    cwd: input.cwd,
  }
}

export const execCommandTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'exec_command',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const cmd = readRequiredText(argumentsValue, 'cmd').trim()
    if (cmd.length === 0) {
      throw new OpenAICompatibleToolError('cmd must not be empty.', {
        fieldName: 'cmd',
      })
    }

    const workdir = readOptionalStringValue(argumentsValue, 'workdir')
    const shellPath = readOptionalStringValue(argumentsValue, 'shell')
    const login = readOptionalBooleanValue(argumentsValue, 'login', true)
    const tty = readOptionalBooleanValue(argumentsValue, 'tty', false)
    const yieldTimeMs = readOptionalNonNegativeIntegerValue(
      argumentsValue,
      'yield_time_ms',
      DEFAULT_EXEC_COMMAND_YIELD_TIME_MS,
    )
    const maxOutputTokens = readOptionalPositiveIntegerValue(argumentsValue, 'max_output_tokens')
    const resolvedCwd = resolveTerminalWorkingDirectory(context.agentContextRootPath, workdir)
    const spawnSpec = await resolveSpawnSpec({
      cmd,
      cwd: resolvedCwd,
      login,
      mode: context.terminalExecutionMode,
      shell: shellPath,
    })
    const sessionId = openTerminalSession({
      args: spawnSpec.args,
      command: spawnSpec.command,
      cwd: spawnSpec.cwd,
      env: createTerminalEnvironment(),
      streamId: context.streamId,
    })

    let pollResult
    try {
      pollResult = await pollTerminalSession({
        maxOutputTokens,
        sessionId,
        signal: context.signal,
        yieldTimeMs,
      })
    } catch (error) {
      if ((error as Error).message === 'aborted') {
        throw new OpenAICompatibleToolError('Tool execution was aborted.')
      }

      throw error
    }

    if (pollResult.spawnError) {
      throw new OpenAICompatibleToolError(`Failed to start command: ${pollResult.spawnError}`)
    }

    const modeLabel = context.terminalExecutionMode === 'sandbox' ? 'sandbox' : 'full'
    const workdirDisplayPath = toTerminalWorkingDirectoryDisplayPath(
      context.agentContextRootPath,
      pollResult.cwd ?? resolvedCwd,
    )
    const formattedOutput = formatTerminalToolOutput(pollResult)
    const message =
      pollResult.processId === null
        ? `Executed command in ${modeLabel} mode (exit code ${pollResult.exitCode ?? 1}).`
        : `Started command in ${modeLabel} mode with session ${pollResult.processId}.`

    return {
      chunkId: pollResult.chunkId,
      commandRunning: pollResult.processId !== null,
      executionMode: modeLabel,
      exitCode: pollResult.exitCode,
      message,
      ok: true,
      operation: 'exec_command',
      originalTokenCount: pollResult.originalTokenCount,
      output: formattedOutput,
      path: workdirDisplayPath,
      processId: pollResult.processId,
      targetKind: 'directory',
      ttyRequested: tty,
      wallTimeMs: pollResult.wallTimeMs,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'exec_command',
      parameters: {
        additionalProperties: false,
        properties: {
          cmd: {
            description: 'Shell command to execute.',
            type: 'string',
          },
          login: {
            description: 'Whether to run the shell with login semantics. Defaults to true.',
            type: 'boolean',
          },
          max_output_tokens: {
            description: 'Maximum number of output tokens to return before truncation.',
            minimum: 1,
            type: 'integer',
          },
          shell: {
            description: 'Optional shell binary to use in Full mode.',
            type: 'string',
          },
          tty: {
            description: 'Whether to request TTY mode. This implementation currently runs with piped stdio.',
            type: 'boolean',
          },
          workdir: {
            description: 'Optional working directory. Relative paths are resolved against the locked root.',
            type: 'string',
          },
          yield_time_ms: {
            description: 'How long to wait for output before returning.',
            minimum: 0,
            type: 'integer',
          },
        },
        required: ['cmd'],
        type: 'object',
      },
    },
    type: 'function',
  },
}

