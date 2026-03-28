import { promises as fs, type Dirent } from 'node:fs'
import path from 'node:path'
import {
  parseToolArguments,
  readOptionalPositiveInteger,
  readRequiredString,
  resolveToolPath,
  toDisplayPath,
} from '../filesystemToolUtils'
import {
  isGitignored,
  loadGitignoreMatchers,
  shouldAlwaysShowEntry,
  shouldIgnoreWorkspaceEntry,
} from '../gitignoreMatcher'
import { getToolDescription } from '../descriptionCatalog'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'

const DEFAULT_DIRECTORY_ENTRY_LIMIT = 200
const TOOL_DESCRIPTION = getToolDescription('list')

async function pathExistsAsDirectory(targetPath: string) {
  try {
    const stats = await fs.stat(targetPath)
    return stats.isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function resolveNestedRelativeListFallback(
  normalizedRootPath: string,
  rawPathArgument: string,
): Promise<string | null> {
  if (path.isAbsolute(rawPathArgument)) {
    return null
  }

  const trimmedPath = rawPathArgument.trim()
  if (trimmedPath.length === 0 || trimmedPath === '.' || trimmedPath.startsWith('..')) {
    return null
  }

  const normalizedRelativePath = trimmedPath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalizedRelativePath.length === 0 || normalizedRelativePath.startsWith('..')) {
    return null
  }

  const rootEntries = await fs.readdir(normalizedRootPath, { withFileTypes: true })
  const candidateMatches: string[] = []

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const candidatePath = path.join(normalizedRootPath, entry.name, normalizedRelativePath)
    if (await pathExistsAsDirectory(candidatePath)) {
      candidateMatches.push(candidatePath)
    }
  }

  if (candidateMatches.length !== 1) {
    return null
  }

  return candidateMatches[0]
}

export const listTool: OpenAICompatibleToolDefinition = {
  executionMode: 'parallel',
  name: 'list',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const limit = readOptionalPositiveInteger(argumentsValue, 'limit', DEFAULT_DIRECTORY_ENTRY_LIMIT)
    const {
      normalizedRootPath,
      normalizedTargetPath: initiallyResolvedTargetPath,
      relativePath: initiallyResolvedRelativePath,
    } = resolveToolPath(
      context.agentContextRootPath,
      absolutePath,
    )
    let normalizedTargetPath = initiallyResolvedTargetPath
    let relativePath = initiallyResolvedRelativePath
    let directoryEntries: Dirent[]

    try {
      directoryEntries = await fs.readdir(normalizedTargetPath, { withFileTypes: true })
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException).code

      if (errorCode === 'ENOENT') {
        const fallbackPath = await resolveNestedRelativeListFallback(normalizedRootPath, absolutePath)
        if (fallbackPath) {
          normalizedTargetPath = fallbackPath
          relativePath = path.relative(normalizedRootPath, normalizedTargetPath) || '.'
          directoryEntries = await fs.readdir(normalizedTargetPath, { withFileTypes: true })
        } else {
          throw new OpenAICompatibleToolError('The requested directory does not exist.', {
            absolutePath: normalizedTargetPath,
          })
        }
      } else if (errorCode === 'ENOTDIR') {
        throw new OpenAICompatibleToolError('absolute_path must point to a directory for list.', {
          absolutePath: normalizedTargetPath,
        })
      } else {
        throw error
      }
    }

    const gitignoreMatchers = await loadGitignoreMatchers(normalizedRootPath, normalizedTargetPath)
    const visibleEntries = directoryEntries.filter((entry) => {
      if (shouldIgnoreWorkspaceEntry(entry.name)) {
        return false
      }

      if (shouldAlwaysShowEntry(entry.name)) {
        return true
      }

      return !isGitignored(path.join(normalizedTargetPath, entry.name), entry.isDirectory(), gitignoreMatchers)
    })
    const sortedEntries = [...visibleEntries].sort((left, right) => left.name.localeCompare(right.name))
    const limitedEntries = sortedEntries.slice(0, limit)

    return {
      absolutePath: normalizedTargetPath,
      entryCount: limitedEntries.length,
      entries: limitedEntries.map((entry) => ({
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        name: entry.name,
      })),
      path: toDisplayPath(relativePath),
      ok: true,
      targetKind: 'directory',
      totalVisibleEntryCount: sortedEntries.length,
      truncated: sortedEntries.length > limitedEntries.length,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'list',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute directory path to inspect. Keep every path segment exactly as written.',
            type: 'string',
          },
          limit: {
            description: 'An optional maximum number of entries to return.',
            minimum: 1,
            type: 'integer',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    },
    type: 'function',
  },
}

