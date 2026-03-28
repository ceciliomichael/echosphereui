import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  isGitignored,
  loadGitignoreMatchers,
  shouldAlwaysShowEntry,
  shouldIgnoreWorkspaceEntry,
} from '../../openaiCompatible/tools/gitignoreMatcher'

const MAX_TREE_DEPTH = 3
const MAX_TREE_LINES = 120
const MAX_DIRECTORIES_PER_LEVEL = 40
const MAX_FILES_PER_LEVEL = 60
const FOLDER_BRANCH_MARKER = '├─'
const INSTRUCTION_DOC_NAMES = new Set(['AGENTS.md', 'DESIGN.md'])

interface TreeBuildState {
  lines: string[]
  truncated: boolean
}

interface VisibleEntry {
  absolutePath: string
  isDirectory: boolean
  name: string
}

interface DirectoryEntriesByType {
  directories: VisibleEntry[]
  files: VisibleEntry[]
}

function appendLine(state: TreeBuildState, line: string) {
  if (state.lines.length >= MAX_TREE_LINES) {
    state.truncated = true
    return false
  }

  state.lines.push(line)
  return true
}

async function readVisibleEntries(
  rootPath: string,
  directoryPath: string,
  matcherCache: Map<string, ReturnType<typeof loadGitignoreMatchers>>,
): Promise<DirectoryEntriesByType> {
  const matcherPromise = matcherCache.get(directoryPath) ?? loadGitignoreMatchers(rootPath, directoryPath)
  matcherCache.set(directoryPath, matcherPromise)
  const matchers = await matcherPromise
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true })

  const visibleEntries: VisibleEntry[] = []
  for (const entry of directoryEntries) {
    const isDirectory = entry.isDirectory()
    const isFile = entry.isFile()

    if (!isDirectory && !isFile) {
      continue
    }

    const absolutePath = path.join(directoryPath, entry.name)
    if (INSTRUCTION_DOC_NAMES.has(entry.name)) {
      continue
    }

    if (
      !shouldIgnoreWorkspaceEntry(entry.name) &&
      (shouldAlwaysShowEntry(entry.name) || !isGitignored(absolutePath, isDirectory, matchers))
    ) {
      visibleEntries.push({
        absolutePath,
        isDirectory,
        name: entry.name,
      })
    }
  }

  const sortByName = (left: VisibleEntry, right: VisibleEntry) => left.name.localeCompare(right.name)
  const directories = visibleEntries.filter((entry) => entry.isDirectory).sort(sortByName)
  const files = visibleEntries.filter((entry) => !entry.isDirectory).sort(sortByName)

  return {
    directories,
    files,
  }
}

async function appendTreeLines(
  rootPath: string,
  directoryPath: string,
  depth: number,
  state: TreeBuildState,
  matcherCache: Map<string, ReturnType<typeof loadGitignoreMatchers>>,
) {
  if (depth > MAX_TREE_DEPTH || state.lines.length >= MAX_TREE_LINES) {
    state.truncated = true
    return
  }

  let entriesByType: DirectoryEntriesByType
  try {
    entriesByType = await readVisibleEntries(rootPath, directoryPath, matcherCache)
  } catch {
    const indent = '  '.repeat(depth)
    appendLine(state, `${indent}${FOLDER_BRANCH_MARKER} [unreadable directory]`)
    return
  }

  const limitedDirectories = entriesByType.directories.slice(0, MAX_DIRECTORIES_PER_LEVEL)
  const hasMoreDirectories = entriesByType.directories.length > limitedDirectories.length

  for (const directoryEntry of limitedDirectories) {
    const indent = '  '.repeat(depth)
    if (!appendLine(state, `${indent}${FOLDER_BRANCH_MARKER} ${directoryEntry.name}/`)) {
      return
    }

    if (depth < MAX_TREE_DEPTH) {
      await appendTreeLines(rootPath, directoryEntry.absolutePath, depth + 1, state, matcherCache)
      if (state.lines.length >= MAX_TREE_LINES) {
        state.truncated = true
        return
      }
    }
  }

  if (hasMoreDirectories) {
    const remainingCount = entriesByType.directories.length - limitedDirectories.length
    const indent = '  '.repeat(depth)
    if (!appendLine(state, `${indent}${FOLDER_BRANCH_MARKER} [... ${remainingCount} more folders omitted]`)) {
      return
    }
  }

  const limitedFiles = entriesByType.files.slice(0, MAX_FILES_PER_LEVEL)
  const hasMoreFiles = entriesByType.files.length > limitedFiles.length

  for (const fileEntry of limitedFiles) {
    const indent = '  '.repeat(depth)
    if (!appendLine(state, `${indent}${FOLDER_BRANCH_MARKER} ${fileEntry.name}`)) {
      return
    }
  }

  if (hasMoreFiles) {
    const remainingCount = entriesByType.files.length - limitedFiles.length
    const indent = '  '.repeat(depth)
    appendLine(state, `${indent}${FOLDER_BRANCH_MARKER} [... ${remainingCount} more files omitted]`)
  }
}

export async function buildWorkspaceFileTree(rootPath: string) {
  const normalizedRootPath = path.resolve(rootPath)
  const state: TreeBuildState = {
    lines: ['.'],
    truncated: false,
  }
  const matcherCache = new Map<string, ReturnType<typeof loadGitignoreMatchers>>()

  await appendTreeLines(normalizedRootPath, normalizedRootPath, 0, state, matcherCache)

  if (state.truncated && state.lines.length < MAX_TREE_LINES) {
    state.lines.push(`${FOLDER_BRANCH_MARKER} [... output truncated]`)
  }

  return state.lines.join('\n')
}
