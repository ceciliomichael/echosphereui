import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  parseToolArguments,
  readOptionalPositiveInteger,
  readRequiredString,
  resolveToolPath,
  toDisplayPath,
} from './filesystemToolUtils'
import { isGitignored, loadGitignoreMatchers, shouldAlwaysShowEntry } from './gitignoreMatcher'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

const DEFAULT_DIRECTORY_ENTRY_LIMIT = 200

export const listTool: OpenAICompatibleToolDefinition = {
  executionMode: 'parallel',
  name: 'list',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const limit = readOptionalPositiveInteger(argumentsValue, 'limit', DEFAULT_DIRECTORY_ENTRY_LIMIT)
    const { normalizedRootPath, normalizedTargetPath, relativePath } = resolveToolPath(
      context.agentContextRootPath,
      absolutePath,
    )

    const directoryEntries = await fs.readdir(normalizedTargetPath, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new OpenAICompatibleToolError('The requested directory does not exist.', {
          absolutePath: normalizedTargetPath,
        })
      }

      if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
        throw new OpenAICompatibleToolError('absolute_path must point to a directory for list.', {
          absolutePath: normalizedTargetPath,
        })
      }

      throw error
    })

    const gitignoreMatchers = await loadGitignoreMatchers(normalizedRootPath, normalizedTargetPath)
    const visibleEntries = directoryEntries.filter((entry) => {
      if (shouldAlwaysShowEntry(entry.name)) {
        return true
      }

      return !isGitignored(path.join(normalizedTargetPath, entry.name), entry.isDirectory(), gitignoreMatchers)
    })
    const sortedEntries = [...visibleEntries].sort((left, right) => left.name.localeCompare(right.name))
    const limitedEntries = sortedEntries.slice(0, limit)

    return {
      entries: limitedEntries.map((entry) => ({
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        name: entry.name,
      })),
      path: toDisplayPath(relativePath),
      ok: true,
      truncated: sortedEntries.length > limitedEntries.length,
    }
  },
  tool: {
    function: {
      description: 'List the contents of a directory inside the locked thread root.',
      name: 'list',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute directory path to inspect.',
            type: 'string',
          },
          limit: {
            description: 'Optional maximum number of entries to return.',
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
