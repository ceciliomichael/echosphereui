import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  parseToolArguments,
  readOptionalBoundedPositiveInteger,
  readRequiredString,
  resolveToolPath,
  toDisplayPath,
} from './filesystemToolUtils'
import { isGitignored, loadGitignoreMatchers, shouldAlwaysShowEntry } from './gitignoreMatcher'
import { resolveRipgrepBinaryPath } from './ripgrepBinary'
import { runRipgrepGlob } from './ripgrepGlobRunner'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

const DEFAULT_GLOB_RESULT_LIMIT = 200
const MAX_GLOB_RESULT_LIMIT = 1_000

function readPattern(input: Record<string, unknown>) {
  const pattern = readRequiredString(input, 'pattern', true)
  if (pattern.length === 0) {
    throw new OpenAICompatibleToolError('pattern must be a non-empty string.', {
      fieldName: 'pattern',
    })
  }

  return pattern
}

async function ensureGlobTargetExists(absolutePath: string) {
  try {
    const targetStats = await fs.stat(absolutePath)
    if (!targetStats.isDirectory() && !targetStats.isFile()) {
      throw new OpenAICompatibleToolError('absolute_path must point to a file or directory for glob.', {
        absolutePath,
      })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new OpenAICompatibleToolError('The requested path does not exist.', {
        absolutePath,
      })
    }

    throw error
  }
}

export const globTool: OpenAICompatibleToolDefinition = {
  executionMode: 'parallel',
  name: 'glob',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const pattern = readPattern(argumentsValue)
    const maxResults = readOptionalBoundedPositiveInteger(
      argumentsValue,
      'max_results',
      DEFAULT_GLOB_RESULT_LIMIT,
      MAX_GLOB_RESULT_LIMIT,
    )
    const { normalizedRootPath, normalizedTargetPath, relativePath } = resolveToolPath(
      context.agentContextRootPath,
      absolutePath,
    )

    await ensureGlobTargetExists(normalizedTargetPath)

    const ripgrepBinaryPath = await resolveRipgrepBinaryPath()
    const globResult = await runRipgrepGlob({
      globPattern: pattern,
      maxResults: MAX_GLOB_RESULT_LIMIT,
      ripgrepBinaryPath,
      searchPath: normalizedTargetPath,
      signal: context.signal,
      workingDirectory: normalizedRootPath,
    })
    const gitignoreMatcherCache = new Map<string, ReturnType<typeof loadGitignoreMatchers>>()
    const visiblePaths: string[] = []

    for (const matchedPath of globResult.absolutePaths) {
      if (shouldAlwaysShowEntry(path.basename(matchedPath))) {
        visiblePaths.push(matchedPath)
        continue
      }

      const matcherDirectoryPath = path.dirname(matchedPath)
      const matcherPromise =
        gitignoreMatcherCache.get(matcherDirectoryPath) ??
        loadGitignoreMatchers(normalizedRootPath, matcherDirectoryPath)
      gitignoreMatcherCache.set(matcherDirectoryPath, matcherPromise)
      const matcherEntries = await matcherPromise

      if (!isGitignored(matchedPath, false, matcherEntries)) {
        visiblePaths.push(matchedPath)
      }
    }

    const limitedPaths = visiblePaths.slice(0, maxResults)

    return {
      matchCount: limitedPaths.length,
      matches: limitedPaths.map((matchedPath) => toDisplayPath(path.relative(normalizedRootPath, matchedPath))),
      ok: true,
      path: toDisplayPath(relativePath),
      pattern,
      targetKind: 'path',
      totalMatchCount: visiblePaths.length,
      truncated: globResult.truncated || visiblePaths.length > limitedPaths.length,
    }
  },
  tool: {
    function: {
      description:
        'Find file paths with ripgrep glob matching inside the workspace.',
      name: 'glob',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file or directory path to search within.',
            type: 'string',
          },
          max_results: {
            description: 'Optional maximum number of matching files to return. Must be between 1 and 1000. Defaults to 200.',
            maximum: 1000,
            minimum: 1,
            type: 'integer',
          },
          pattern: {
            description: 'Glob pattern used to filter file paths (for example "**/*.ts").',
            type: 'string',
          },
        },
        required: ['absolute_path', 'pattern'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
