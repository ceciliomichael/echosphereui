import { spawn } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { OpenAICompatibleToolError } from '../toolTypes'

const MAX_STDERR_LENGTH = 8_192

export interface RipgrepMatch {
  absolutePath: string
  columnNumber: number
  lineNumber: number
  lineText: string
}

export interface RipgrepSearchRequest {
  caseSensitive: boolean
  isRegex: boolean
  maxResults: number
  pattern: string
  ripgrepBinaryPath: string
  searchPath: string
  signal: AbortSignal
  workingDirectory: string
}

interface RipgrepLineEvent {
  data?: unknown
  type?: unknown
}

interface RipgrepMatchEventData {
  line_number?: unknown
  lines?: unknown
  path?: unknown
  submatches?: unknown
}

interface RipgrepSubmatch {
  start?: unknown
}

function readObject(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    return null
  }

  return input as Record<string, unknown>
}

function readNestedText(input: unknown, firstLevelFieldName: string, nestedFieldName: string) {
  const firstLevel = readObject(input)
  if (!firstLevel) {
    return null
  }

  const nestedObject = readObject(firstLevel[firstLevelFieldName])
  if (!nestedObject) {
    return null
  }

  const nestedValue = nestedObject[nestedFieldName]
  if (typeof nestedValue !== 'string') {
    return null
  }

  return nestedValue
}

function readPositiveInteger(input: unknown, fallbackValue: number) {
  if (typeof input === 'number' && Number.isInteger(input) && input > 0) {
    return input
  }

  return fallbackValue
}

function normalizeLineText(lineText: string) {
  return lineText.endsWith('\n') ? lineText.slice(0, -1).replace(/\r$/, '') : lineText
}

function toAbsoluteMatchPath(matchPath: string, workingDirectory: string) {
  return path.isAbsolute(matchPath) ? path.resolve(matchPath) : path.resolve(workingDirectory, matchPath)
}

function parseRipgrepSubmatches(submatchesValue: unknown) {
  if (!Array.isArray(submatchesValue)) {
    return []
  }

  return submatchesValue
    .map((value) => readObject(value) as RipgrepSubmatch | null)
    .filter((value): value is RipgrepSubmatch => value !== null)
}

function parseRipgrepMatchLine(input: string, workingDirectory: string): RipgrepMatch[] {
  let parsedEvent: RipgrepLineEvent
  try {
    parsedEvent = JSON.parse(input) as RipgrepLineEvent
  } catch {
    return []
  }

  if (parsedEvent.type !== 'match') {
    return []
  }

  const matchData = readObject(parsedEvent.data) as RipgrepMatchEventData | null
  if (!matchData) {
    return []
  }

  const matchPath = readNestedText(matchData, 'path', 'text')
  if (!matchPath) {
    return []
  }

  const absolutePath = toAbsoluteMatchPath(matchPath, workingDirectory)
  const lineNumber = readPositiveInteger(matchData.line_number, 1)
  const lineText = normalizeLineText(readNestedText(matchData, 'lines', 'text') ?? '')
  const submatches = parseRipgrepSubmatches(matchData.submatches)

  if (submatches.length === 0) {
    return [
      {
        absolutePath,
        columnNumber: 1,
        lineNumber,
        lineText,
      },
    ]
  }

  return submatches.map((submatch) => ({
    absolutePath,
    columnNumber:
      typeof submatch.start === 'number' && Number.isInteger(submatch.start) && submatch.start >= 0
        ? submatch.start + 1
        : 1,
    lineNumber,
    lineText,
  }))
}

interface RipgrepSearchResult {
  matches: RipgrepMatch[]
  truncated: boolean
}

export function buildRipgrepArguments(request: Pick<RipgrepSearchRequest, 'caseSensitive' | 'isRegex' | 'pattern' | 'searchPath'>) {
  const argumentsList = [
    '--json',
    '--line-number',
    '--column',
    '--no-heading',
    '--color',
    'never',
    '--no-config',
    '--no-require-git',
  ]

  if (!request.isRegex) {
    argumentsList.push('--fixed-strings')
  }

  if (!request.caseSensitive) {
    argumentsList.push('--ignore-case')
  }

  argumentsList.push('-e', request.pattern, request.searchPath)

  return argumentsList
}

function buildAbortedError() {
  return new OpenAICompatibleToolError('Tool execution was aborted.')
}

export async function runRipgrepSearch(request: RipgrepSearchRequest): Promise<RipgrepSearchResult> {
  if (request.signal.aborted) {
    throw buildAbortedError()
  }

  const ripgrepArguments = buildRipgrepArguments(request)
  const child = spawn(request.ripgrepBinaryPath, ripgrepArguments, {
    cwd: request.workingDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stderrText = ''
  const matches: RipgrepMatch[] = []
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

    const parsedMatches = parseRipgrepMatchLine(line, request.workingDirectory)
    for (const parsedMatch of parsedMatches) {
      if (matches.length >= request.maxResults) {
        exceededMaxResults = true
        child.kill()
        return
      }

      matches.push(parsedMatch)
    }
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
      matches,
      truncated: true,
    }
  }

  if (closeResult.code === 0 || closeResult.code === 1) {
    return {
      matches,
      truncated: false,
    }
  }

  throw new OpenAICompatibleToolError('ripgrep command failed.', {
    args: ripgrepArguments,
    exitCode: closeResult.code,
    exitSignal: closeResult.signal,
    stderr: stderrText.trim(),
  })
}
