import { createReadStream, promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { jsonSchema, tool, type ToolSet } from 'ai'
import { getDiffSummary } from '../../../src/lib/textDiff'
import type { FileChangeDiffToolResultItem } from '../../../src/types/chat'
import { loadGitignoreMatchers, isGitignored, shouldAlwaysShowEntry, shouldIgnoreWorkspaceEntry } from '../../workspace/gitignoreMatcher'
import {
  assertWorkspaceDirectory,
  DEFAULT_WORKSPACE_RELATIVE_PATH,
  getSafeWorkspaceTargetPath,
  normalizeWorkspacePath,
} from '../../workspace/paths'
import { captureWorkspaceCheckpointFileState } from '../../workspace/checkpoints'
import { applyPatchInWorkspace } from './applyPatch'
import type { AgentToolContext, AgentToolExecutionResult } from './toolTypes'

const DEFAULT_READ_LIMIT = 2000
const LIST_LIMIT = 100
const SEARCH_LIMIT = 100
const MAX_LINE_LENGTH = 2000
const MAX_READ_BYTES = 50 * 1024
const MAX_READ_BYTES_LABEL = `${MAX_READ_BYTES / 1024} KB`
const require = createRequire(import.meta.url)
const RIPGREP_EXECUTABLE_NAME = process.platform === 'win32' ? 'rg.exe' : 'rg'
let ripgrepCommandCandidatesPromise: Promise<string[]> | null = null

class RipgrepBinaryNotFoundError extends Error {
  attemptedCommands: string[]

  constructor(attemptedCommands: string[], failures: string[]) {
    const failureSummary = failures.length > 0 ? ` Errors: ${failures.join(' | ')}` : ''
    super(`Ripgrep binary is unavailable. Tried: ${attemptedCommands.join(', ') || 'no candidate paths'}.${failureSummary}`)
    this.attemptedCommands = attemptedCommands
    this.name = 'RipgrepBinaryNotFoundError'
  }
}

interface ResolveRipgrepCommandCandidatesOptions {
  currentWorkingDirectory?: string | null
  includePathLookup?: boolean
  isPackagedApp?: boolean
  moduleCandidatePaths?: string[]
  pathExistsImpl?: typeof pathExists
  resourcesPath?: string | null
}

function normalizeRipgrepCandidatePath(candidatePath: string) {
  const trimmedPath = candidatePath.trim()
  if (trimmedPath.length === 0) {
    return trimmedPath
  }

  const repairedScopedModulePath = trimmedPath
    .replace(/^node_modules(?=@[^\\/]+)/u, `node_modules${path.sep}`)
    .replace(/([\\/])node_modules(?=@[^\\/]+)/gu, `$1node_modules${path.sep}`)

  return path.normalize(repairedScopedModulePath)
}

function toUniquePaths(candidatePaths: Array<string | null | undefined>) {
  const seenPaths = new Set<string>()
  const uniquePaths: string[] = []

  for (const candidatePath of candidatePaths) {
    if (!candidatePath) {
      continue
    }

    const normalizedPath = normalizeRipgrepCandidatePath(candidatePath)
    if (normalizedPath.length === 0) {
      continue
    }

    if (seenPaths.has(normalizedPath)) {
      continue
    }

    seenPaths.add(normalizedPath)
    uniquePaths.push(normalizedPath)
  }

  return uniquePaths
}

async function pathExists(candidatePath: string) {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
}

function resetRipgrepCommandCandidatesCache() {
  ripgrepCommandCandidatesPromise = null
}

function resolveRipgrepModuleCandidatePaths() {
  const candidatePaths: Array<string | null | undefined> = []

  try {
    const ripgrepModule = require('@vscode/ripgrep') as { rgPath?: string }
    if (typeof ripgrepModule.rgPath === 'string' && ripgrepModule.rgPath.trim().length > 0) {
      candidatePaths.push(ripgrepModule.rgPath)
    }
  } catch {
    // Ignore and continue with other resolution strategies.
  }

  try {
    const ripgrepPackageJsonPath = require.resolve('@vscode/ripgrep/package.json')
    candidatePaths.push(path.join(path.dirname(ripgrepPackageJsonPath), 'bin', RIPGREP_EXECUTABLE_NAME))
  } catch {
    // Ignore and continue with other resolution strategies.
  }

  return toUniquePaths(candidatePaths)
}

async function buildRipgrepCommandCandidates(
  options: ResolveRipgrepCommandCandidatesOptions = {},
) {
  const isPackagedApp = options.isPackagedApp ?? (typeof process.defaultApp === 'boolean' ? !process.defaultApp : false)
  const resourcesPath =
    options.resourcesPath ??
    (typeof process.resourcesPath === 'string' && process.resourcesPath.trim().length > 0 ? process.resourcesPath : null)
  const currentWorkingDirectory =
    options.currentWorkingDirectory ?? (typeof process.cwd === 'function' ? process.cwd() : null)
  const pathExistsImpl = options.pathExistsImpl ?? pathExists
  const moduleCandidatePaths = toUniquePaths(options.moduleCandidatePaths ?? resolveRipgrepModuleCandidatePaths())
  const bundledCandidatePaths = resourcesPath
    ? toUniquePaths([
        path.join(resourcesPath, 'ripgrep', RIPGREP_EXECUTABLE_NAME),
        path.join(resourcesPath, 'app.asar.unpacked', 'ripgrep', RIPGREP_EXECUTABLE_NAME),
        path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@vscode', 'ripgrep', 'bin', RIPGREP_EXECUTABLE_NAME),
      ])
    : []
  const developmentCandidatePaths = toUniquePaths([
    ...moduleCandidatePaths,
    currentWorkingDirectory
      ? path.join(currentWorkingDirectory, 'node_modules', '@vscode', 'ripgrep', 'bin', RIPGREP_EXECUTABLE_NAME)
      : null,
  ])
  const candidatePaths = isPackagedApp
    ? [...bundledCandidatePaths, ...developmentCandidatePaths]
    : [...developmentCandidatePaths, ...bundledCandidatePaths]
  const availablePaths: string[] = []

  for (const candidatePath of candidatePaths) {
    if (await pathExistsImpl(candidatePath)) {
      availablePaths.push(candidatePath)
    }
  }

  if (options.includePathLookup === false) {
    return availablePaths
  }

  return toUniquePaths([...availablePaths, RIPGREP_EXECUTABLE_NAME])
}

async function resolveRipgrepCommandCandidates() {
  if (!ripgrepCommandCandidatesPromise) {
    ripgrepCommandCandidatesPromise = buildRipgrepCommandCandidates()
  }

  return ripgrepCommandCandidatesPromise
}

function isRetryableRipgrepSpawnError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) {
    return false
  }

  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'EACCES'
}

async function runRipgrepWithCandidates(
  args: string[],
  cwd: string,
  candidateCommands: string[],
  spawnImpl: typeof spawn = spawn,
) {
  const attemptedCommands: string[] = []
  const failures: string[] = []

  for (const candidateCommand of candidateCommands) {
    attemptedCommands.push(candidateCommand)

    try {
      const result = await new Promise<{ exitCode: number; stderr: string; stdout: string }>((resolve, reject) => {
        const child = spawnImpl(candidateCommand, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (chunk: Buffer | string) => {
          stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk: Buffer | string) => {
          stderr += chunk.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
          resolve({
            exitCode: code ?? 1,
            stderr,
            stdout,
          })
        })
      })

      return result
    } catch (error) {
      if (isRetryableRipgrepSpawnError(error)) {
        failures.push(`${candidateCommand}: ${error.code}`)
        continue
      }

      throw error
    }
  }

  throw new RipgrepBinaryNotFoundError(attemptedCommands, failures)
}

function resolveWorkspaceTargetPath(workspaceRootPath: string, candidatePath: string | undefined) {
  if (!candidatePath || candidatePath.trim().length === 0) {
    return {
      absolutePath: workspaceRootPath,
      relativePath: DEFAULT_WORKSPACE_RELATIVE_PATH,
    }
  }

  if (path.isAbsolute(candidatePath)) {
    return getSafeWorkspaceTargetPath(workspaceRootPath, path.relative(workspaceRootPath, candidatePath))
  }

  return getSafeWorkspaceTargetPath(workspaceRootPath, candidatePath)
}

function createSuccessResult(input: Omit<AgentToolExecutionResult, 'status'>): AgentToolExecutionResult {
  return {
    ...input,
    status: 'success',
  }
}

function createErrorResult(summary: string, input?: Pick<AgentToolExecutionResult, 'body' | 'subject'>): AgentToolExecutionResult {
  return {
    ...(input?.body ? { body: input.body } : {}),
    status: 'error',
    ...(input?.subject ? { subject: input.subject } : {}),
    summary,
  }
}

function hasBinaryContent(buffer: Buffer) {
  const probeLength = Math.min(buffer.length, 1024)

  for (let index = 0; index < probeLength; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }

  return false
}

function toFileChangeItem(
  fileName: string,
  kind: FileChangeDiffToolResultItem['kind'],
  oldContent: string | null,
  newContent: string,
): FileChangeDiffToolResultItem {
  const summary = getDiffSummary(oldContent, newContent)
  return {
    addedLineCount: summary.addedLineCount,
    fileName,
    kind,
    newContent,
    oldContent,
    removedLineCount: summary.removedLineCount,
  }
}

function buildFileChangeResult(
  summary: string,
  changes: FileChangeDiffToolResultItem[],
  operation: 'edit' | 'noop',
  subjectPath: string,
) {
  const addedPathCount = changes.filter((change) => change.kind === 'add').length
  const deletedPathCount = changes.filter((change) => change.kind === 'delete').length
  const updatedPathCount = changes.filter((change) => change.kind === 'update').length
  const bodyLines = [summary]

  for (const change of changes) {
    const label = change.kind === 'add' ? 'A' : change.kind === 'delete' ? 'D' : 'M'
    bodyLines.push(`${label} ${change.fileName}`)
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    resultPresentation: {
      changes,
      kind: 'file_change_diff',
    },
    semantics: {
      added_path_count: addedPathCount,
      deleted_path_count: deletedPathCount,
      operation,
      updated_path_count: updatedPathCount,
    },
    subject: {
      kind: changes.length === 1 ? 'file' : 'workspace',
      path: subjectPath,
    },
    summary,
  })
}

async function captureCheckpointFileStateIfNeeded(checkpointId: string | null | undefined, absolutePath: string) {
  const normalizedCheckpointId = checkpointId?.trim()
  if (!normalizedCheckpointId) {
    return
  }

  await captureWorkspaceCheckpointFileState(normalizedCheckpointId, absolutePath)
}

async function runRipgrep(args: string[], cwd: string) {
  try {
    return await runRipgrepWithCandidates(args, cwd, await resolveRipgrepCommandCandidates())
  } catch (error) {
    if (!(error instanceof RipgrepBinaryNotFoundError)) {
      throw error
    }

    resetRipgrepCommandCandidatesCache()
    return runRipgrepWithCandidates(args, cwd, await resolveRipgrepCommandCandidates())
  }
}

async function listImmediateDirectoryEntries(workspaceRootPath: string, directoryPath: string) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const gitignoreMatchers = await loadGitignoreMatchers(workspaceRootPath, directoryPath)
  const visibleEntries = entries
    .filter((entry) => !entry.isSymbolicLink())
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .filter((entry) => !shouldIgnoreWorkspaceEntry(entry.name))
    .filter((entry) => {
      if (shouldAlwaysShowEntry(entry.name)) {
        return true
      }

      return !isGitignored(path.join(directoryPath, entry.name), entry.isDirectory(), gitignoreMatchers)
    })
    .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))

  return visibleEntries
}

async function createListToolResult(workspaceRootPath: string, absolutePath: string, relativePath: string) {
  const result = await runRipgrep(['--files', '--hidden'], absolutePath)
  if (result.exitCode !== 0) {
    const immediateEntries = await listImmediateDirectoryEntries(workspaceRootPath, absolutePath)
    return createSuccessResult({
      body: [`Directory: ${absolutePath}`, '', ...immediateEntries].join('\n'),
      semantics: {
        count: immediateEntries.length,
      },
      subject: {
        kind: 'directory',
        path: relativePath,
      },
      summary: `Listed ${relativePath}`,
    })
  }

  const files = result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const limitedFiles = files.slice(0, LIST_LIMIT)
  const directories = new Set<string>(['.'])
  const filesByDirectory = new Map<string, string[]>()

  for (const file of limitedFiles) {
    const directoryName = path.dirname(file)
    const segments = directoryName === '.' ? [] : directoryName.split(/[\\/]/u)

    for (let index = 0; index <= segments.length; index += 1) {
      const directoryPath = index === 0 ? '.' : segments.slice(0, index).join('/')
      directories.add(directoryPath)
    }

    if (!filesByDirectory.has(directoryName)) {
      filesByDirectory.set(directoryName, [])
    }

    filesByDirectory.get(directoryName)?.push(path.basename(file))
  }

  function renderDirectory(directoryName: string, depth: number): string[] {
    const lines: string[] = []
    if (depth > 0) {
      lines.push(`${'  '.repeat(depth)}${path.basename(directoryName)}/`)
    }

    const childDirectories = Array.from(directories)
      .filter((candidate) => candidate !== directoryName && path.dirname(candidate) === directoryName)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))

    for (const childDirectory of childDirectories) {
      lines.push(...renderDirectory(childDirectory, depth + 1))
    }

    const fileEntries = [...(filesByDirectory.get(directoryName) ?? [])].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    )
    for (const fileEntry of fileEntries) {
      lines.push(`${'  '.repeat(depth + 1)}${fileEntry}`)
    }

    return lines
  }

  const bodyLines = [`Directory: ${absolutePath}`, '', ...renderDirectory('.', 0)]
  if (files.length > LIST_LIMIT) {
    bodyLines.push('', `(Showing ${LIST_LIMIT} of ${files.length} files. Refine the path or use glob/read next.)`)
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    semantics: {
      count: files.length,
    },
    subject: {
      kind: 'directory',
      path: relativePath,
    },
    summary: `Listed ${relativePath}`,
    truncated: files.length > LIST_LIMIT,
  })
}

async function createReadToolResult(
  absolutePath: string,
  relativePath: string,
  offset: number | undefined,
  limit: number | undefined,
) {
  const stats = await fs.stat(absolutePath)
  if (stats.isDirectory()) {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true })
    const start = Math.max(0, (offset ?? 1) - 1)
    const maxEntries = limit ?? DEFAULT_READ_LIMIT
    const lines = entries
      .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    const sliced = lines.slice(start, start + maxEntries)

    return createSuccessResult({
      body: [`Path: ${absolutePath}`, 'Type: directory', '', ...sliced].join('\n'),
      semantics: {
        entry_count: lines.length,
        is_directory: true,
      },
      subject: {
        kind: 'directory',
        path: relativePath,
      },
      summary: `Read directory ${relativePath}`,
      truncated: start + sliced.length < lines.length,
    })
  }

  const probe = Buffer.alloc(Math.min(stats.size, 1024))
  if (probe.length > 0) {
    const fileHandle = await fs.open(absolutePath, 'r')
    try {
      await fileHandle.read(probe, 0, probe.length, 0)
    } finally {
      await fileHandle.close()
    }
  }

  if (hasBinaryContent(probe)) {
    return createErrorResult(`Cannot read binary file ${relativePath}`, {
      body: `Binary files are not supported by the read tool: ${absolutePath}`,
      subject: {
        kind: 'file',
        path: relativePath,
      },
    })
  }

  const startLine = Math.max(1, offset ?? 1)
  const maxLines = Math.max(1, limit ?? DEFAULT_READ_LIMIT)
  const stream = createReadStream(absolutePath, { encoding: 'utf8' })
  const reader = createInterface({
    crlfDelay: Infinity,
    input: stream,
  })

  const collectedLines: string[] = []
  let byteCount = 0
  let hasMoreLines = false
  let lineCount = 0
  let truncatedByBytes = false

  try {
    for await (const line of reader) {
      lineCount += 1
      if (lineCount < startLine) {
        continue
      }

      if (collectedLines.length >= maxLines) {
        hasMoreLines = true
        continue
      }

      const limitedLine =
        line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}... (line truncated)` : line
      const nextBytes = Buffer.byteLength(limitedLine, 'utf8') + (collectedLines.length > 0 ? 1 : 0)
      if (byteCount + nextBytes > MAX_READ_BYTES) {
        truncatedByBytes = true
        hasMoreLines = true
        break
      }

      collectedLines.push(limitedLine)
      byteCount += nextBytes
    }
  } finally {
    reader.close()
    stream.destroy()
  }

  if (lineCount < startLine && !(lineCount === 0 && startLine === 1)) {
    return createErrorResult(`Offset ${startLine} is out of range for ${relativePath}`, {
      subject: {
        kind: 'file',
        path: relativePath,
      },
    })
  }

  const numberedLines = collectedLines.map((line, index) => `${startLine + index}: ${line}`)
  const bodyLines = [`Path: ${absolutePath}`, 'Type: file', '', ...numberedLines]
  if (truncatedByBytes) {
    bodyLines.push('', `(Output capped at ${MAX_READ_BYTES_LABEL}. Continue with offset=${startLine + collectedLines.length}.)`)
  } else if (hasMoreLines) {
    bodyLines.push('', `(Showing lines ${startLine}-${startLine + collectedLines.length - 1} of ${lineCount}. Continue with offset=${startLine + collectedLines.length}.)`)
  } else {
    bodyLines.push('', `(End of file - ${lineCount} lines total)`)
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    semantics: {
      is_directory: false,
      line_count: lineCount,
      offset: startLine,
    },
    subject: {
      kind: 'file',
      path: relativePath,
    },
    summary: `Read ${relativePath}`,
    truncated: truncatedByBytes || hasMoreLines,
  })
}

async function createGlobToolResult(absolutePath: string, relativePath: string, pattern: string) {
  const result = await runRipgrep(['--files', '--hidden', '--glob', pattern], absolutePath)
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return createErrorResult(`Glob failed for ${relativePath}`, {
      body: result.stderr.trim() || `ripgrep exited with code ${result.exitCode}`,
      subject: {
        kind: 'directory',
        path: relativePath,
      },
    })
  }

  const relativeMatches = result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  const matches = relativeMatches.map((entry) => path.resolve(absolutePath, entry))
  const limitedMatches = matches.slice(0, SEARCH_LIMIT)
  const bodyLines = limitedMatches.length === 0 ? ['No files found'] : limitedMatches

  if (matches.length > SEARCH_LIMIT) {
    bodyLines.push('', `(Showing ${SEARCH_LIMIT} of ${matches.length} matches. Narrow the pattern or path.)`)
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    semantics: {
      count: matches.length,
      pattern,
    },
    subject: {
      kind: 'directory',
      path: relativePath,
    },
    summary:
      matches.length === 0
        ? `No files matched ${pattern} in ${relativePath}`
        : `Found ${matches.length} file${matches.length === 1 ? '' : 's'} matching ${pattern}`,
    truncated: matches.length > SEARCH_LIMIT,
  })
}

interface GrepMatch {
  absolutePath: string
  lineNumber: number
  lineText: string
  modifiedAt: number
}

async function createGrepToolResult(
  absolutePath: string,
  relativePath: string,
  pattern: string,
  include: string | undefined,
) {
  const args = ['--json', '--hidden', '--line-number', '--no-messages', pattern, '.']
  if (include && include.trim().length > 0) {
    args.splice(4, 0, '--glob', include.trim())
  }

  const result = await runRipgrep(args, absolutePath)
  if (result.exitCode === 1) {
    return createSuccessResult({
      body: 'No files found',
      semantics: {
        match_count: 0,
        pattern,
      },
      subject: {
        kind: 'directory',
        path: relativePath,
      },
      summary: `No matches for ${pattern}`,
    })
  }

  if (result.exitCode !== 0 && result.exitCode !== 2) {
    return createErrorResult(`Search failed for ${pattern}`, {
      body: result.stderr.trim() || `ripgrep exited with code ${result.exitCode}`,
      subject: {
        kind: 'directory',
        path: relativePath,
      },
    })
  }

  const matches: GrepMatch[] = []
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line.trim()) {
      continue
    }

    let parsedLine: unknown
    try {
      parsedLine = JSON.parse(line)
    } catch {
      continue
    }

    if (
      typeof parsedLine !== 'object' ||
      parsedLine === null ||
      (parsedLine as { type?: string }).type !== 'match'
    ) {
      continue
    }

    const matchData = parsedLine as {
      data?: {
        line_number?: number
        lines?: { text?: string }
        path?: { text?: string }
      }
    }
    const matchPath = matchData.data?.path?.text
    const lineNumber = matchData.data?.line_number
    const lineText = matchData.data?.lines?.text
    if (typeof matchPath !== 'string' || typeof lineNumber !== 'number' || typeof lineText !== 'string') {
      continue
    }

    const candidateAbsolutePath = path.resolve(absolutePath, matchPath)
    const modifiedAt = (await fs.stat(candidateAbsolutePath).catch(() => null))?.mtimeMs ?? 0
    matches.push({
      absolutePath: candidateAbsolutePath,
      lineNumber,
      lineText: lineText.trimEnd().slice(0, MAX_LINE_LENGTH),
      modifiedAt,
    })
  }

  matches.sort((left, right) => {
    if (right.modifiedAt !== left.modifiedAt) {
      return right.modifiedAt - left.modifiedAt
    }

    if (left.absolutePath !== right.absolutePath) {
      return left.absolutePath.localeCompare(right.absolutePath, undefined, { sensitivity: 'base' })
    }

    return left.lineNumber - right.lineNumber
  })

  const limitedMatches = matches.slice(0, SEARCH_LIMIT)
  if (limitedMatches.length === 0) {
    return createSuccessResult({
      body: 'No files found',
      semantics: {
        match_count: 0,
        pattern,
      },
      subject: {
        kind: 'directory',
        path: relativePath,
      },
      summary: `No matches for ${pattern}`,
    })
  }

  const bodyLines = [`Found ${matches.length} match${matches.length === 1 ? '' : 'es'}`]
  let currentPath: string | null = null
  for (const match of limitedMatches) {
    if (match.absolutePath !== currentPath) {
      if (currentPath !== null) {
        bodyLines.push('')
      }
      currentPath = match.absolutePath
      bodyLines.push(match.absolutePath)
    }

    bodyLines.push(`  ${match.lineNumber}: ${match.lineText}`)
  }

  if (matches.length > SEARCH_LIMIT) {
    bodyLines.push('', `(Showing ${SEARCH_LIMIT} of ${matches.length} matches. Narrow the pattern or include filter.)`)
  }

  return createSuccessResult({
    body: bodyLines.join('\n'),
    semantics: {
      match_count: matches.length,
      pattern,
    },
    subject: {
      kind: 'directory',
      path: relativePath,
    },
    summary: `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for ${pattern}`,
    truncated: matches.length > SEARCH_LIMIT,
  })
}

async function createFileChangeToolResult(
  context: Pick<AgentToolContext, 'checkpointId' | 'workspaceRootPath'>,
  input: {
    changes: Array<{
      absolute_path: string
      content?: string
      operation: 'delete' | 'write'
    }>
  },
) {
  const fileChanges: FileChangeDiffToolResultItem[] = []

  for (const change of input.changes) {
    const target = resolveWorkspaceTargetPath(context.workspaceRootPath, change.absolute_path)
    if (change.operation === 'delete') {
      const previousContent = await fs.readFile(target.absolutePath, 'utf8').catch(() => null)
      if (previousContent === null) {
        return createErrorResult(`Cannot delete missing file ${target.relativePath}`, {
          subject: {
            kind: 'file',
            path: target.relativePath,
          },
        })
      }

      await captureCheckpointFileStateIfNeeded(context.checkpointId, target.absolutePath)
      await fs.unlink(target.absolutePath)
      fileChanges.push(toFileChangeItem(target.relativePath, 'delete', previousContent, ''))
      continue
    }

    if (typeof change.content !== 'string') {
      return createErrorResult(`Write operation requires content for ${target.relativePath}`, {
        subject: {
          kind: 'file',
          path: target.relativePath,
        },
      })
    }

    const previousContent = await fs.readFile(target.absolutePath, 'utf8').catch(() => null)
    await captureCheckpointFileStateIfNeeded(context.checkpointId, target.absolutePath)
    await fs.mkdir(path.dirname(target.absolutePath), { recursive: true })
    await fs.writeFile(target.absolutePath, change.content, 'utf8')
    fileChanges.push(toFileChangeItem(target.relativePath, previousContent === null ? 'add' : 'update', previousContent, change.content))
  }

  const subjectPath = fileChanges.length === 1 ? fileChanges[0].fileName : DEFAULT_WORKSPACE_RELATIVE_PATH
  return buildFileChangeResult(
    `Applied ${fileChanges.length} file change${fileChanges.length === 1 ? '' : 's'}`,
    fileChanges,
    fileChanges.length === 0 ? 'noop' : 'edit',
    subjectPath,
  )
}

async function createApplyPatchToolResult(context: Pick<AgentToolContext, 'checkpointId' | 'workspaceRootPath'>, patchText: string) {
  const appliedPatch = await applyPatchInWorkspace(context.workspaceRootPath, patchText, {
    onBeforeChange: async ({ absolutePath, nextAbsolutePath }) => {
      await captureCheckpointFileStateIfNeeded(context.checkpointId, absolutePath)
      if (nextAbsolutePath && nextAbsolutePath !== absolutePath) {
        await captureCheckpointFileStateIfNeeded(context.checkpointId, nextAbsolutePath)
      }
    },
  })
  const changes = appliedPatch.changes.map((change) =>
    toFileChangeItem(change.relativePath, change.type, change.oldContent, change.newContent),
  )
  const subjectPath = changes.length === 1 ? changes[0].fileName : DEFAULT_WORKSPACE_RELATIVE_PATH

  return buildFileChangeResult(
    `Patched ${changes.length} file${changes.length === 1 ? '' : 's'}`,
    changes,
    changes.length === 0 ? 'noop' : 'edit',
    subjectPath,
  )
}

function createWholeFileApplyTool(context: Pick<AgentToolContext, 'checkpointId' | 'workspaceRootPath'>) {
  return tool({
    description:
      'Create, replace, or delete entire files. Prefer this for whole-file writes or file creation; prefer apply_patch for surgical edits.',
    inputSchema: jsonSchema({
      additionalProperties: false,
      properties: {
        changes: {
          items: {
            additionalProperties: false,
            properties: {
              absolute_path: {
                type: 'string',
              },
              content: {
                type: 'string',
              },
              operation: {
                enum: ['delete', 'write'],
                type: 'string',
              },
            },
            required: ['absolute_path', 'operation'],
            type: 'object',
          },
          minItems: 1,
          type: 'array',
        },
      },
      required: ['changes'],
      type: 'object',
    }),
    execute: async (rawInput) => {
      const inputValue = rawInput as {
        changes: Array<{
          absolute_path: string
          content?: string
          operation: 'delete' | 'write'
        }>
      }
      try {
        return await createFileChangeToolResult(context, inputValue)
      } catch (error) {
        return createErrorResult(
          error instanceof Error && error.message.trim().length > 0 ? error.message : 'File change failed.',
        )
      }
    },
  })
}

async function createToolContext(input: AgentToolContext) {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  return {
    checkpointId: input.checkpointId?.trim() || null,
    workspaceRootPath,
  }
}

export async function createAgentTools(input: AgentToolContext, options?: { readOnly?: boolean }): Promise<ToolSet> {
  const context = await createToolContext(input)

  const tools: ToolSet = {
    list: tool({
      description: 'Recursively list files from a workspace directory. Prefer this before reading when you need orientation.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
        },
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as { absolute_path?: string }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createListToolResult(context.workspaceRootPath, target.absolutePath, target.relativePath)
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'List failed.',
          )
        }
      },
    }),
    read: tool({
      description: 'Read a UTF-8 text file with numbered lines. Use offset to continue large files.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
          limit: {
            minimum: 1,
            type: 'number',
          },
          offset: {
            minimum: 1,
            type: 'number',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          absolute_path: string
          limit?: number
          offset?: number
        }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createReadToolResult(target.absolutePath, target.relativePath, inputValue.offset, inputValue.limit)
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Read failed.',
          )
        }
      },
    }),
    glob: tool({
      description: 'Find files by glob pattern within the workspace. Use this when you know filename shape but not the exact location.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
          pattern: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['pattern'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          absolute_path?: string
          pattern: string
        }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createGlobToolResult(target.absolutePath, target.relativePath, inputValue.pattern)
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Glob failed.',
          )
        }
      },
    }),
    grep: tool({
      description: 'Search file contents with a regex pattern. Use include to narrow by filename glob.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          absolute_path: {
            type: 'string',
          },
          include: {
            type: 'string',
          },
          pattern: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['pattern'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as {
          absolute_path?: string
          include?: string
          pattern: string
        }
        try {
          const target = resolveWorkspaceTargetPath(context.workspaceRootPath, inputValue.absolute_path)
          return await createGrepToolResult(target.absolutePath, target.relativePath, inputValue.pattern, inputValue.include)
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Search failed.',
          )
        }
      },
    }),
  }

  if (options?.readOnly) {
    return tools
  }

  return {
    ...tools,
    apply: createWholeFileApplyTool(context),
    file_change: createWholeFileApplyTool(context),
    apply_patch: tool({
      description:
        'Apply a structured patch using the Codex-style *** Begin Patch format. Prefer this for targeted edits to existing files.',
      inputSchema: jsonSchema({
        additionalProperties: false,
        properties: {
          patchText: {
            minLength: 1,
            type: 'string',
          },
        },
        required: ['patchText'],
        type: 'object',
      }),
      execute: async (rawInput) => {
        const inputValue = rawInput as { patchText: string }
        try {
          return await createApplyPatchToolResult(context, inputValue.patchText)
        } catch (error) {
          return createErrorResult(
            error instanceof Error && error.message.trim().length > 0 ? error.message : 'Patch failed.',
          )
        }
      },
    }),
  }
}

export const __testOnly = {
  buildRipgrepCommandCandidates,
  normalizeRipgrepCandidatePath,
  runRipgrepWithCandidates,
}
