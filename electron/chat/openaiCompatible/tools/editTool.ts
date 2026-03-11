import { promises as fs } from 'node:fs'
import {
  normalizeLineEndings,
  parseToolArguments,
  readOptionalBoolean,
  readRequiredString,
  readRequiredText,
  resolveToolPath,
} from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

function getLineNumberFromIndex(input: string, index: number) {
  return input.slice(0, index).split('\n').length
}

function getNearbySnippet(input: string, targetLine: number) {
  const lines = input.split('\n')
  const startLine = Math.max(1, targetLine - 3)
  const endLine = Math.min(lines.length, targetLine + 3)

  return lines
    .slice(startLine - 1, endLine)
    .map((line, offset) => `${startLine + offset} | ${line}`)
    .join('\n')
}

function buildMissingMatchDetails(fileContent: string, oldString: string) {
  const normalizedContent = normalizeLineEndings(fileContent)
  const normalizedOldString = normalizeLineEndings(oldString)
  const firstSearchLine = normalizedOldString.split('\n')[0]?.trim()
  const candidateLineIndex =
    firstSearchLine && firstSearchLine.length > 0
      ? normalizedContent
          .split('\n')
          .findIndex((line) => line.includes(firstSearchLine))
      : -1

  return {
    candidateSnippet:
      candidateLineIndex >= 0 ? getNearbySnippet(normalizedContent, candidateLineIndex + 1) : null,
    expectedOldString: normalizedOldString,
  }
}

export const editTool: OpenAICompatibleToolDefinition = {
  name: 'edit',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const oldString = readRequiredText(argumentsValue, 'old_string')
    const newString = readRequiredText(argumentsValue, 'new_string', true)
    const replaceAll = readOptionalBoolean(argumentsValue, 'replace_all', false)
    const { normalizedTargetPath } = resolveToolPath(context.agentContextRootPath, absolutePath)

    const fileContent = await fs.readFile(normalizedTargetPath, 'utf8').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new OpenAICompatibleToolError('The requested file does not exist.', {
          absolutePath: normalizedTargetPath,
        })
      }

      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new OpenAICompatibleToolError('absolute_path must point to a file for edit.', {
          absolutePath: normalizedTargetPath,
        })
      }

      throw error
    })

    const normalizedContent = normalizeLineEndings(fileContent)
    const normalizedOldString = normalizeLineEndings(oldString)
    const normalizedNewString = normalizeLineEndings(newString)
    const usesCrlf = fileContent.includes('\r\n')

    if (normalizedOldString.length === 0) {
      throw new OpenAICompatibleToolError('old_string must not be empty.', {
        absolutePath: normalizedTargetPath,
      })
    }

    const occurrences = normalizedContent.split(normalizedOldString).length - 1
    if (occurrences === 0) {
      throw new OpenAICompatibleToolError('old_string was not found in the target file.', {
        absolutePath: normalizedTargetPath,
        ...buildMissingMatchDetails(fileContent, oldString),
      })
    }

    if (!replaceAll && occurrences > 1) {
      throw new OpenAICompatibleToolError('old_string matched multiple locations. Retry with a more specific old_string or set replace_all to true.', {
        absolutePath: normalizedTargetPath,
        matchCount: occurrences,
      })
    }

    const nextContent = replaceAll
      ? normalizedContent.split(normalizedOldString).join(normalizedNewString)
      : normalizedContent.replace(normalizedOldString, normalizedNewString)

    await fs.writeFile(normalizedTargetPath, usesCrlf ? nextContent.replace(/\n/g, '\r\n') : nextContent, 'utf8')

    const firstMatchIndex = normalizedContent.indexOf(normalizedOldString)
    return {
      absolutePath: normalizedTargetPath,
      matchCount: occurrences,
      ok: true,
      replacementMode: replaceAll ? 'all' : 'single',
      startLine: firstMatchIndex >= 0 ? getLineNumberFromIndex(normalizedContent, firstMatchIndex) : 1,
    }
  },
  tool: {
    function: {
      description: 'Patch an existing file by replacing exact old_string content with new_string inside the locked thread root.',
      name: 'edit',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file path to patch.',
            type: 'string',
          },
          new_string: {
            description: 'Replacement text for the matched old_string.',
            type: 'string',
          },
          old_string: {
            description: 'Exact file content to replace.',
            type: 'string',
          },
          replace_all: {
            description: 'Optional flag to replace every exact occurrence instead of requiring a single match.',
            type: 'boolean',
          },
        },
        required: ['absolute_path', 'old_string', 'new_string'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
