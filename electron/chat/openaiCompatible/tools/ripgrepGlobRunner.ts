import { spawn } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { OpenAICompatibleToolError } from '../toolTypes'

const MAX_STDERR_LENGTH = 8_192

export interface RipgrepGlobRequest {
  globPattern: string
  maxResults: number
  ripgrepBinaryPath: string
  searchPath: string
  signal: AbortSignal
  workingDirectory: string
}

export interface RipgrepGlobResult {
  absolutePaths: string[]
  truncated: boolean
}

function toAbsoluteFilePath(filePath: string, workingDirectory: string) {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(workingDirectory, filePath)
}

function buildAbortedError() {
  return new OpenAICompatibleToolError('Tool execution was aborted.')
}

export function buildRipgrepGlobArguments(request: Pick<RipgrepGlobRequest, 'globPattern' | 'searchPath'>) {
  return [
    '--files',
    '--no-config',
    '--no-require-git',
    '--glob',
    request.globPattern,
    request.searchPath,
  ]
}

export async function runRipgrepGlob(request: RipgrepGlobRequest): Promise<RipgrepGlobResult> {
  if (request.signal.aborted) {
    throw buildAbortedError()
  }

  const ripgrepArguments = buildRipgrepGlobArguments(request)
  const child = spawn(request.ripgrepBinaryPath, ripgrepArguments, {
    cwd: request.workingDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stderrText = ''
  const absolutePaths: string[] = []
  let exceededMaxResults = false
  let wasAborted = false

  const stdoutReader = createInterface({
    crlfDelay: Infinity,
    input: child.stdout,
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    if (stderrText.length >= MAX_STDERR_LENGTH) {
      return
    }

    const remainingLength = MAX_STDERR_LENGTH - stderrText.length
    stderrText += chunk.slice(0, remainingLength)
  })

  stdoutReader.on('line', (line) => {
    if (exceededMaxResults || wasAborted) {
      return
    }

    if (!line.trim()) {
      return
    }

    if (absolutePaths.length >= request.maxResults) {
      exceededMaxResults = true
      child.kill()
      return
    }

    absolutePaths.push(toAbsoluteFilePath(line.trim(), request.workingDirectory))
  })

  const abortHandler = () => {
    wasAborted = true
    child.kill()
  }
  request.signal.addEventListener('abort', abortHandler, { once: true })

  const closeResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      resolve({
        code,
        signal,
      })
    })
  }).finally(() => {
    request.signal.removeEventListener('abort', abortHandler)
    stdoutReader.close()
  })

  if (request.signal.aborted || wasAborted) {
    throw buildAbortedError()
  }

  if (exceededMaxResults) {
    return {
      absolutePaths,
      truncated: true,
    }
  }

  if (closeResult.code === 0 || closeResult.code === 1) {
    return {
      absolutePaths,
      truncated: false,
    }
  }

  throw new OpenAICompatibleToolError('ripgrep glob command failed.', {
    args: ripgrepArguments,
    exitCode: closeResult.code,
    exitSignal: closeResult.signal,
    stderr: stderrText.trim(),
  })
}
