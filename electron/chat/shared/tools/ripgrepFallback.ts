import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import {
  isGitignored,
  loadGitignoreMatchers,
  shouldAlwaysShowEntry,
  shouldIgnoreWorkspaceEntry,
} from '../../../workspace/gitignoreMatcher'

const MAX_LINE_LENGTH = 2000

interface SearchMatch {
  absolutePath: string
  lineNumber: number
  lineText: string
  modifiedAt: number
  relativePath: string
}

interface RipgrepFallbackResult {
  exitCode: number
  stderr: string
  stdout: string
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

function createWorkspaceEntryVisibilityFilter(workspaceRootPath: string) {
  const matcherCache = new Map<string, Promise<Awaited<ReturnType<typeof loadGitignoreMatchers>>>>()

  function loadCachedMatchers(directoryPath: string) {
    const normalizedDirectoryPath = path.resolve(directoryPath)
    let matchersPromise = matcherCache.get(normalizedDirectoryPath)
    if (!matchersPromise) {
      matchersPromise = loadGitignoreMatchers(workspaceRootPath, normalizedDirectoryPath)
      matcherCache.set(normalizedDirectoryPath, matchersPromise)
    }

    return matchersPromise
  }

  return async (entryAbsolutePath: string, isDirectory: boolean) => {
    const entryName = path.basename(entryAbsolutePath)
    const workspaceRelativeSegments = path
      .relative(workspaceRootPath, entryAbsolutePath)
      .split(path.sep)
      .filter((segment) => segment.length > 0)

    if (workspaceRelativeSegments.some((segment) => shouldIgnoreWorkspaceEntry(segment))) {
      return false
    }

    if (shouldAlwaysShowEntry(entryName)) {
      return true
    }

    const gitignoreMatchers = await loadCachedMatchers(path.dirname(entryAbsolutePath))
    return !isGitignored(entryAbsolutePath, isDirectory, gitignoreMatchers)
  }
}

async function visitVisibleFiles(
  workspaceRootPath: string,
  currentDirectoryPath: string,
  isVisibleEntry: (entryAbsolutePath: string, isDirectory: boolean) => Promise<boolean>,
  onFile: (fileAbsolutePath: string, fileRelativePath: string) => Promise<void> | void,
) {
  const directoryEntries = await fs.readdir(currentDirectoryPath, { withFileTypes: true })

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isSymbolicLink()) {
      continue
    }

    const isDirectory = directoryEntry.isDirectory()
    if (!isDirectory && !directoryEntry.isFile()) {
      continue
    }

    const entryAbsolutePath = path.join(currentDirectoryPath, directoryEntry.name)
    if (!(await isVisibleEntry(entryAbsolutePath, isDirectory))) {
      continue
    }

    if (isDirectory) {
      await visitVisibleFiles(workspaceRootPath, entryAbsolutePath, isVisibleEntry, onFile)
      continue
    }

    const fileRelativePath = path.relative(workspaceRootPath, entryAbsolutePath)
    await onFile(entryAbsolutePath, fileRelativePath)
  }
}

async function collectVisibleFilePaths(workspaceRootPath: string) {
    const filePaths: string[] = []
  const isVisibleEntry = createWorkspaceEntryVisibilityFilter(workspaceRootPath)
  await visitVisibleFiles(workspaceRootPath, workspaceRootPath, isVisibleEntry, async (_, fileRelativePath) => {
    filePaths.push(fileRelativePath)
  })
  return filePaths
}

function toJsonMatchLine(relativePath: string, lineNumber: number, lineText: string) {
  return JSON.stringify({
    data: {
      line_number: lineNumber,
      lines: {
        text: lineText,
      },
      path: {
        text: relativePath,
      },
    },
    type: 'match',
  })
}

function compileSearchPattern(pattern: string) {
  try {
    return new RegExp(pattern, 'u')
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0 ? error.message : 'Invalid search pattern.'
    throw new Error(message)
  }
}

async function searchVisibleFiles(
  workspaceRootPath: string,
  pattern: string,
  include: string | undefined,
) {
  const includePattern = include?.trim()
  const searchExpression = compileSearchPattern(pattern)
  const matches: SearchMatch[] = []
  const isVisibleEntry = createWorkspaceEntryVisibilityFilter(workspaceRootPath)

  await visitVisibleFiles(workspaceRootPath, workspaceRootPath, isVisibleEntry, async (fileAbsolutePath, fileRelativePath) => {
    if (includePattern && !path.matchesGlob(fileRelativePath, includePattern)) {
      return
    }

    const fileStats = await fs.stat(fileAbsolutePath).catch(() => null)
    if (!fileStats?.isFile()) {
      return
    }

    const probe = Buffer.alloc(Math.min(fileStats.size, 1024))
    if (probe.length > 0) {
      const fileHandle = await fs.open(fileAbsolutePath, 'r')
      try {
        await fileHandle.read(probe, 0, probe.length, 0)
      } finally {
        await fileHandle.close()
      }
    }

    if (hasBinaryContent(probe)) {
      return
    }

    const modifiedAt = fileStats.mtimeMs
    const stream = createReadStream(fileAbsolutePath, { encoding: 'utf8' })
    const reader = createInterface({
      crlfDelay: Infinity,
      input: stream,
    })

    let lineNumber = 0
    try {
      for await (const line of reader) {
        lineNumber += 1
        if (!searchExpression.test(line)) {
          continue
        }

        matches.push({
          absolutePath: fileAbsolutePath,
          lineNumber,
          lineText: line.trimEnd().slice(0, MAX_LINE_LENGTH),
          modifiedAt,
          relativePath: fileRelativePath,
        })
      }
    } finally {
      reader.close()
      stream.destroy()
    }
  })

  matches.sort((left, right) => {
    if (right.modifiedAt !== left.modifiedAt) {
      return right.modifiedAt - left.modifiedAt
    }

    if (left.absolutePath !== right.absolutePath) {
      return left.absolutePath.localeCompare(right.absolutePath, undefined, { sensitivity: 'base' })
    }

    return left.lineNumber - right.lineNumber
  })

  return matches
}

function getArgumentValue(args: string[], flagName: string) {
  const flagIndex = args.indexOf(flagName)
  if (flagIndex === -1 || flagIndex + 1 >= args.length) {
    return null
  }

  return args[flagIndex + 1]
}

function getSearchPatternArg(args: string[]) {
  if (args.length < 2) {
    return null
  }

  return args[args.length - 2] ?? null
}

export async function runRipgrepFallback(args: string[], cwd: string): Promise<RipgrepFallbackResult> {
  if (args.includes('--files')) {
    const files = await collectVisibleFilePaths(cwd)
    const globPattern = getArgumentValue(args, '--glob')
    const normalizedGlobPattern = globPattern?.trim()
    const filteredFiles =
      normalizedGlobPattern && normalizedGlobPattern.length > 0
        ? files.filter((filePath) => path.matchesGlob(filePath, normalizedGlobPattern))
        : files

    return {
      exitCode: 0,
      stderr: '',
      stdout: filteredFiles.join('\n'),
    }
  }

  if (args.includes('--json') && args.includes('--line-number')) {
    const searchPattern = getSearchPatternArg(args)
    if (searchPattern === null || searchPattern === '.') {
      return {
        exitCode: 2,
        stderr: 'Invalid search pattern.',
        stdout: '',
      }
    }

    const include = getArgumentValue(args, '--glob') ?? undefined
    const matches = await searchVisibleFiles(cwd, searchPattern, include)
    if (matches.length === 0) {
      return {
        exitCode: 1,
        stderr: '',
        stdout: '',
      }
    }

    return {
      exitCode: 0,
      stderr: '',
      stdout: matches.map((match) => toJsonMatchLine(match.relativePath, match.lineNumber, match.lineText)).join('\n'),
    }
  }

  throw new Error('Unsupported ripgrep fallback invocation.')
}
