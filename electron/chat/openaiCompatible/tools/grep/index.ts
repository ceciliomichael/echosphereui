import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  parseToolArguments,
  readOptionalBoolean,
  readOptionalBoundedPositiveInteger,
  readRequiredString,
  resolveToolPath,
  toDisplayPath,
} from '../filesystemToolUtils'
import { resolveRipgrepBinaryPath } from '../ripgrepBinary'
import { runRipgrepSearch } from '../ripgrepRunner'
import { getToolDescription } from '../descriptionCatalog'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'

const DEFAULT_GREP_RESULT_LIMIT = 200
const MAX_GREP_RESULT_LIMIT = 1_000
const TOOL_DESCRIPTION = getToolDescription('grep')

function readPattern(input: Record<string, unknown>) {
  const pattern = readRequiredString(input, 'pattern', true)
  if (pattern.length === 0) {
    throw new OpenAICompatibleToolError('pattern must be a non-empty string.', {
      fieldName: 'pattern',
    })
  }

  if (pattern.includes('\n') || pattern.includes('\r')) {
    throw new OpenAICompatibleToolError(
      'pattern must be a single line. Use separate grep calls or read the file range when you need multiline context.',
      {
        fieldName: 'pattern',
      },
    )
  }

  return pattern
}

async function ensureSearchTargetExists(absolutePath: string) {
  try {
    const targetStats = await fs.stat(absolutePath)
    if (!targetStats.isDirectory() && !targetStats.isFile()) {
      throw new OpenAICompatibleToolError('absolute_path must point to a file or directory for grep.', {
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

export const grepTool: OpenAICompatibleToolDefinition = {
  executionMode: 'parallel',
  name: 'grep',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const pattern = readPattern(argumentsValue)
    const isRegex = readOptionalBoolean(argumentsValue, 'is_regex', false)
    const caseSensitive = readOptionalBoolean(argumentsValue, 'case_sensitive', false)
    const maxResults = readOptionalBoundedPositiveInteger(
      argumentsValue,
      'max_results',
      DEFAULT_GREP_RESULT_LIMIT,
      MAX_GREP_RESULT_LIMIT,
    )
    const { normalizedRootPath, normalizedTargetPath, relativePath } = resolveToolPath(
      context.agentContextRootPath,
      absolutePath,
    )

    await ensureSearchTargetExists(normalizedTargetPath)

    const ripgrepBinaryPath = await resolveRipgrepBinaryPath()
    const searchResult = await runRipgrepSearch({
      caseSensitive,
      isRegex,
      maxResults,
      pattern,
      ripgrepBinaryPath,
      searchPath: normalizedTargetPath,
      signal: context.signal,
      workingDirectory: normalizedRootPath,
    })

    return {
      matchCount: searchResult.matches.length,
      matches: searchResult.matches.map((match) => ({
        columnNumber: match.columnNumber,
        lineNumber: match.lineNumber,
        lineText: match.lineText,
        path: toDisplayPath(path.relative(normalizedRootPath, match.absolutePath)),
      })),
      ok: true,
      path: toDisplayPath(relativePath),
      pattern,
      targetKind: 'path',
      truncated: searchResult.truncated,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'grep',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file or directory path to search within.',
            type: 'string',
          },
          case_sensitive: {
            description: 'Optional flag to enforce case-sensitive matching. Defaults to false.',
            type: 'boolean',
          },
          is_regex: {
            description: 'Optional flag to interpret pattern as a regular expression. Defaults to false (fixed string).',
            type: 'boolean',
          },
          max_results: {
            description: 'Optional maximum number of matches to return. Must be between 1 and 1000. Defaults to 200.',
            maximum: 1000,
            minimum: 1,
            type: 'integer',
          },
          pattern: {
            description: 'Search pattern (fixed string by default, regex when is_regex is true). Must be a single line.',
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

