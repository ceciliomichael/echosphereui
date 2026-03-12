import { promises as fs } from 'node:fs'
import {
  normalizeLineEndings,
  parseToolArguments,
  readOptionalBoolean,
  readRequiredString,
  readRequiredText,
  resolveToolPath,
  toDisplayPath,
} from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

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

function getLineNumberAtIndex(input: string, index: number) {
  return input.slice(0, index).split('\n').length
}

function createFocusedDiffSnippet(
  oldFileContent: string,
  newFileContent: string,
  startLineNumber: number,
  changedOldLineCount: number,
  changedNewLineCount: number,
  contextLines = 5,
) {
  const oldLines = oldFileContent.split('\n')
  const newLines = newFileContent.split('\n')
  const changedVisibleLineCount = Math.max(changedOldLineCount, changedNewLineCount)
  const snippetStartLine = Math.max(1, startLineNumber - contextLines)
  const snippetEndLine = startLineNumber + changedVisibleLineCount + contextLines - 1

  return {
    contextLines,
    endLineNumber: Math.max(snippetStartLine, snippetEndLine),
    newContent: newLines.slice(snippetStartLine - 1, Math.min(newLines.length, snippetEndLine)).join('\n'),
    oldContent: oldLines.slice(snippetStartLine - 1, Math.min(oldLines.length, snippetEndLine)).join('\n'),
    startLineNumber: snippetStartLine,
  }
}

export const editTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'edit',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const oldString = readRequiredText(argumentsValue, 'old_string')
    const newString = readRequiredText(argumentsValue, 'new_string', true)
    const replaceAll = readOptionalBoolean(argumentsValue, 'replace_all', false)
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, absolutePath)

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

    const replacementIndex = normalizedContent.indexOf(normalizedOldString)
    const singleEditStartLine = replacementIndex >= 0 ? getLineNumberAtIndex(normalizedContent, replacementIndex) : 1
    const oldLineCount = normalizedOldString.split('\n').length
    const newLineCount = normalizedNewString.split('\n').length
    const singleEditEndLine =
      singleEditStartLine + Math.max(oldLineCount, newLineCount) - 1
    const usesWholeFileDiff = replaceAll || occurrences > 1

    await fs.writeFile(normalizedTargetPath, usesCrlf ? nextContent.replace(/\n/g, '\r\n') : nextContent, 'utf8')

    const focusedDiffSnippet = usesWholeFileDiff
      ? null
      : createFocusedDiffSnippet(normalizedContent, nextContent, singleEditStartLine, oldLineCount, newLineCount)

    return {
      contextLines: usesWholeFileDiff ? 5 : focusedDiffSnippet?.contextLines,
      endLineNumber: usesWholeFileDiff ? nextContent.split('\n').length : focusedDiffSnippet?.endLineNumber ?? singleEditEndLine,
      message: `Edited ${toDisplayPath(relativePath)} successfully.`,
      newContent: usesWholeFileDiff ? nextContent : focusedDiffSnippet?.newContent ?? normalizedNewString,
      oldContent: usesWholeFileDiff ? normalizedContent : focusedDiffSnippet?.oldContent ?? normalizedOldString,
      ok: true,
      path: toDisplayPath(relativePath),
      startLineNumber: usesWholeFileDiff ? 1 : focusedDiffSnippet?.startLineNumber ?? singleEditStartLine,
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
