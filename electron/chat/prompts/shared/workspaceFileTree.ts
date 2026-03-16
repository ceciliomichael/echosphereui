import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isGitignored, loadGitignoreMatchers, shouldAlwaysShowEntry } from '../../openaiCompatible/tools/gitignoreMatcher'

const MAX_TREE_DEPTH = 3
const MAX_TREE_LINES = 120
const MAX_DIRECTORIES_PER_LEVEL = 40
const FOLDER_BRANCH_MARKER = '├─'

interface TreeBuildState {
  lines: string[]
  truncated: boolean
}

interface VisibleDirectory {
  absolutePath: string
  name: string
}

async function readVisibleDirectories(
  rootPath: string,
  directoryPath: string,
  matcherCache: Map<string, ReturnType<typeof loadGitignoreMatchers>>,
) {
  const matcherPromise = matcherCache.get(directoryPath) ?? loadGitignoreMatchers(rootPath, directoryPath)
  matcherCache.set(directoryPath, matcherPromise)
  const matchers = await matcherPromise
  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true })

  const visibleDirectories: VisibleDirectory[] = []
  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    if (shouldAlwaysShowEntry(entry.name)) {
      visibleDirectories.push({
        absolutePath: path.join(directoryPath, entry.name),
        name: entry.name,
      })
      continue
    }

    const absolutePath = path.join(directoryPath, entry.name)
    if (!isGitignored(absolutePath, true, matchers)) {
      visibleDirectories.push({
        absolutePath,
        name: entry.name,
      })
    }
  }

  visibleDirectories.sort((left, right) => left.name.localeCompare(right.name))
  return visibleDirectories
}

async function appendTreeLines(
  rootPath: string,
  directoryPath: string,
  depth: number,
  state: TreeBuildState,
  matcherCache: Map<string, ReturnType<typeof loadGitignoreMatchers>>,
) {
  if (state.lines.length >= MAX_TREE_LINES || depth > MAX_TREE_DEPTH) {
    state.truncated = true
    return
  }

  let visibleDirectories: VisibleDirectory[]
  try {
    visibleDirectories = await readVisibleDirectories(rootPath, directoryPath, matcherCache)
  } catch {
    const indent = '  '.repeat(depth)
    state.lines.push(`${indent}${FOLDER_BRANCH_MARKER} [unreadable directory]`)
    return
  }

  const limitedDirectories = visibleDirectories.slice(0, MAX_DIRECTORIES_PER_LEVEL)
  const hasMoreDirectories = visibleDirectories.length > limitedDirectories.length

  for (let index = 0; index < limitedDirectories.length; index += 1) {
    if (state.lines.length >= MAX_TREE_LINES) {
      state.truncated = true
      return
    }

    const directoryEntry = limitedDirectories[index]
    const indent = '  '.repeat(depth)
    state.lines.push(`${indent}${FOLDER_BRANCH_MARKER} ${directoryEntry.name}/`)

    if (depth < MAX_TREE_DEPTH) {
      await appendTreeLines(rootPath, directoryEntry.absolutePath, depth + 1, state, matcherCache)
      if (state.lines.length >= MAX_TREE_LINES) {
        state.truncated = true
        return
      }
    }
  }

  if (hasMoreDirectories && state.lines.length < MAX_TREE_LINES) {
    const remainingCount = visibleDirectories.length - limitedDirectories.length
    const indent = '  '.repeat(depth)
    state.lines.push(`${indent}${FOLDER_BRANCH_MARKER} [... ${remainingCount} more folders omitted]`)
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
