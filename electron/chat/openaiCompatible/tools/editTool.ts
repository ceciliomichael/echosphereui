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
import { captureWorkspaceCheckpointFileState } from '../../../workspace/checkpoints'

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

interface LineScopedRange {
  charEnd: number
  charStart: number
  endLine: number
  startLine: number
  text: string
}

function getScopedLineRange(content: string): LineScopedRange {
  const lines = content.split('\n')
  const totalLineCount = Math.max(lines.length, 1)
  const startLine = 1
  const endLine = totalLineCount

  let charStart = 0
  let charEnd = 0
  for (let lineIndex = 0; lineIndex < endLine; lineIndex += 1) {
    charEnd += lines[lineIndex].length
    if (lineIndex < endLine - 1) {
      charEnd += 1
    }
  }

  return {
    charEnd,
    charStart,
    endLine,
    startLine,
    text: lines.slice(startLine - 1, endLine).join('\n'),
  }
}

function getLineNumberAtIndex(input: string, index: number) {
  return input.slice(0, index).split('\n').length
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildWhitespaceTolerantRegex(input: string) {
  const parts = input.match(/(\s+|\S+)/g) ?? []
  const pattern = parts
    .map((part) => (/^\s+$/u.test(part) ? (part.includes('\n') ? '\\s+' : '[\\t ]+') : escapeRegExp(part)))
    .join('')

  return new RegExp(pattern, 'gu')
}

function findWhitespaceTolerantMatches(content: string, oldString: string) {
  const regex = buildWhitespaceTolerantRegex(oldString)
  return Array.from(content.matchAll(regex))
}

function getLeadingWhitespace(value: string) {
  const match = value.match(/^[\t ]*/u)
  return match ? match[0] : ''
}

function buildLineStartOffsets(input: string) {
  const lineStartOffsets = [0]
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '\n') {
      lineStartOffsets.push(index + 1)
    }
  }

  return lineStartOffsets
}

interface IndentFlexibleMatch {
  endIndex: number
  indentOffset: string
  startIndex: number
}

function findIndentFlexibleMatches(content: string, oldString: string): IndentFlexibleMatch[] {
  const oldLines = oldString.split('\n')
  const contentLines = content.split('\n')
  if (oldLines.length < 2 || oldString.length < 20 || contentLines.length < oldLines.length) {
    return []
  }

  const lineStartOffsets = buildLineStartOffsets(content)
  const matches: IndentFlexibleMatch[] = []

  for (let contentLineIndex = 0; contentLineIndex <= contentLines.length - oldLines.length; contentLineIndex += 1) {
    let isMatch = true
    let indentOffset = ''

    for (let offset = 0; offset < oldLines.length; offset += 1) {
      const oldLine = oldLines[offset]
      const contentLine = contentLines[contentLineIndex + offset]
      const oldLineTrimmed = oldLine.trimStart()
      const contentLineTrimmed = contentLine.trimStart()

      if (oldLineTrimmed !== contentLineTrimmed) {
        isMatch = false
        break
      }

      if (offset === 0 && oldLineTrimmed.length > 0) {
        const oldIndent = getLeadingWhitespace(oldLine)
        const contentIndent = getLeadingWhitespace(contentLine)
        if (contentIndent.startsWith(oldIndent)) {
          indentOffset = contentIndent.slice(oldIndent.length)
        } else {
          indentOffset = ''
        }
      }
    }

    if (!isMatch) {
      continue
    }

    const matchStartLineOffset = lineStartOffsets[contentLineIndex]
    const lastMatchedLineIndex = contentLineIndex + oldLines.length - 1
    const lastMatchedLineStartOffset = lineStartOffsets[lastMatchedLineIndex]
    const lastMatchedLine = contentLines[lastMatchedLineIndex]
    const endIndex = lastMatchedLineStartOffset + lastMatchedLine.length

    matches.push({
      endIndex,
      indentOffset,
      startIndex: matchStartLineOffset,
    })
  }

  return matches
}

function applyIndentOffsetToNewString(newString: string, indentOffset: string) {
  if (indentOffset.length === 0) {
    return newString
  }

  return newString
    .split('\n')
    .map((line) => (line.trim().length === 0 ? line : `${indentOffset}${line}`))
    .join('\n')
}

function getFirstNonEmptyLine(lines: string[]) {
  return lines.find((line) => line.trim().length > 0) ?? ''
}

function computeIndentOffsetFromMatchedText(oldString: string, matchedText: string) {
  const oldFirstNonEmptyLine = getFirstNonEmptyLine(oldString.split('\n'))
  const matchedFirstNonEmptyLine = getFirstNonEmptyLine(matchedText.split('\n'))
  if (oldFirstNonEmptyLine.length === 0 || matchedFirstNonEmptyLine.length === 0) {
    return ''
  }

  const oldIndent = getLeadingWhitespace(oldFirstNonEmptyLine)
  const matchedIndent = getLeadingWhitespace(matchedFirstNonEmptyLine)
  if (matchedIndent.startsWith(oldIndent)) {
    return matchedIndent.slice(oldIndent.length)
  }

  return ''
}

function computeLinePrefixIndentAtMatchStart(content: string, matchStartIndex: number) {
  const safeMatchStart = Math.max(0, Math.min(matchStartIndex, content.length))
  const lineStartIndex = content.lastIndexOf('\n', safeMatchStart - 1) + 1
  const prefix = content.slice(lineStartIndex, safeMatchStart)
  return /^[\t ]*$/u.test(prefix) ? prefix : ''
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
  executionMode: 'path-exclusive',
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

    const scopedRange = getScopedLineRange(normalizedContent)
    const scopedContent = scopedRange.text

    const exactOccurrences = scopedContent.split(normalizedOldString).length - 1
    if (!replaceAll && exactOccurrences > 1) {
      throw new OpenAICompatibleToolError('old_string matched multiple locations. Retry with a more specific old_string or set replace_all to true.', {
        absolutePath: normalizedTargetPath,
        candidateRanges: [
          {
            endLine: scopedRange.endLine,
            startLine: scopedRange.startLine,
          },
        ],
        matchCount: exactOccurrences,
        matchStrategyAttempted: 'exact',
        whyRejected: 'ambiguous_match',
      })
    }

    let replacementIndex = scopedContent.indexOf(normalizedOldString)
    let replacementCount = replaceAll ? exactOccurrences : exactOccurrences > 0 ? 1 : 0
    let nextContent = normalizedContent

    if (exactOccurrences > 0) {
      if (replaceAll) {
        const replacedScopedContent = scopedContent.split(normalizedOldString).join(normalizedNewString)
        nextContent =
          normalizedContent.slice(0, scopedRange.charStart) +
          replacedScopedContent +
          normalizedContent.slice(scopedRange.charEnd)
      } else {
        const matchedLength = normalizedOldString.length
        const absoluteMatchStart = scopedRange.charStart + replacementIndex
        nextContent =
          normalizedContent.slice(0, absoluteMatchStart) +
          normalizedNewString +
          normalizedContent.slice(absoluteMatchStart + matchedLength)
      }
    } else if (!replaceAll) {
      const whitespaceMatches = findWhitespaceTolerantMatches(scopedContent, normalizedOldString)
      if (whitespaceMatches.length === 1) {
        const match = whitespaceMatches[0]
        const matchStart = match.index ?? -1
        if (matchStart >= 0) {
          const matchedText = match[0]
          replacementIndex = matchStart
          replacementCount = 1
          const linePrefixIndent = computeLinePrefixIndentAtMatchStart(scopedContent, matchStart)
          const oldFirstNonEmptyLine = getFirstNonEmptyLine(normalizedOldString.split('\n'))
          const oldFirstIndent = getLeadingWhitespace(oldFirstNonEmptyLine)
          const derivedIndentOffset =
            linePrefixIndent.startsWith(oldFirstIndent) ? linePrefixIndent.slice(oldFirstIndent.length) : linePrefixIndent
          const adjustedNewString =
            normalizedOldString.includes('\n')
              ? applyIndentOffsetToNewString(
                  normalizedNewString,
                  derivedIndentOffset.length > 0
                    ? derivedIndentOffset
                    : computeIndentOffsetFromMatchedText(normalizedOldString, matchedText),
                )
              : normalizedNewString
          const absoluteMatchStart = scopedRange.charStart + matchStart
          nextContent =
            normalizedContent.slice(0, absoluteMatchStart) +
            adjustedNewString +
            normalizedContent.slice(absoluteMatchStart + matchedText.length)
        }
      } else if (whitespaceMatches.length > 1) {
        throw new OpenAICompatibleToolError(
          'old_string matched multiple whitespace-tolerant locations. Retry with a more specific old_string or set replace_all to true.',
          {
            absolutePath: normalizedTargetPath,
            candidateRanges: [
              {
                endLine: scopedRange.endLine,
                startLine: scopedRange.startLine,
              },
            ],
            matchCount: whitespaceMatches.length,
            matchStrategy: 'whitespace_tolerant',
            matchStrategyAttempted: 'whitespace_tolerant',
            whyRejected: 'ambiguous_match',
          },
        )
      }

      if (replacementCount === 0) {
        const indentFlexibleMatches = findIndentFlexibleMatches(scopedContent, normalizedOldString)
        if (indentFlexibleMatches.length === 1) {
          const match = indentFlexibleMatches[0]
          const absoluteMatchStart = scopedRange.charStart + match.startIndex
          const absoluteMatchEnd = scopedRange.charStart + match.endIndex
          const adjustedNewString = applyIndentOffsetToNewString(normalizedNewString, match.indentOffset)
          replacementIndex = match.startIndex
          replacementCount = 1
          nextContent =
            normalizedContent.slice(0, absoluteMatchStart) +
            adjustedNewString +
            normalizedContent.slice(absoluteMatchEnd)
        } else if (indentFlexibleMatches.length > 1) {
          throw new OpenAICompatibleToolError(
            'old_string matched multiple indent-flexible locations. Retry with a more specific old_string or set replace_all to true.',
            {
              absolutePath: normalizedTargetPath,
              candidateRanges: [
                {
                  endLine: scopedRange.endLine,
                  startLine: scopedRange.startLine,
                },
              ],
              matchCount: indentFlexibleMatches.length,
              matchStrategy: 'indent_flexible',
              matchStrategyAttempted: 'indent_flexible',
              whyRejected: 'ambiguous_match',
            },
          )
        }
      }
    }

    if (replacementCount === 0) {
      const alreadyAppliedIndex = scopedContent.indexOf(normalizedNewString)
      if (alreadyAppliedIndex >= 0) {
        const alreadyAppliedStartLine = getLineNumberAtIndex(scopedContent, alreadyAppliedIndex) + scopedRange.startLine - 1
        const alreadyAppliedLineCount = Math.max(1, normalizedNewString.split('\n').length)
        const alreadyAppliedEndLine = alreadyAppliedStartLine + alreadyAppliedLineCount - 1
        const alreadyAppliedSnippet = createFocusedDiffSnippet(
          normalizedContent,
          normalizedContent,
          alreadyAppliedStartLine,
          alreadyAppliedLineCount,
          alreadyAppliedLineCount,
        )

        return {
          contentChanged: false,
          contextLines: alreadyAppliedSnippet.contextLines,
          endLineNumber: alreadyAppliedSnippet.endLineNumber ?? alreadyAppliedEndLine,
          message: `Confirmed ${toDisplayPath(relativePath)} already matched the requested edit.`,
          newContent: alreadyAppliedSnippet.newContent,
          oldContent: alreadyAppliedSnippet.oldContent,
          ok: true,
          operation: 'noop',
          path: toDisplayPath(relativePath),
          replacementCount: 0,
          startLineNumber: alreadyAppliedSnippet.startLineNumber ?? alreadyAppliedStartLine,
          targetKind: 'file',
        }
      }

      throw new OpenAICompatibleToolError('old_string was not found in the target file.', {
        absolutePath: normalizedTargetPath,
        ...buildMissingMatchDetails(fileContent, oldString),
        candidateRanges: [
          {
            endLine: scopedRange.endLine,
            startLine: scopedRange.startLine,
          },
        ],
        matchStrategyAttempted:
          normalizedOldString.includes('\n') && normalizedOldString.length >= 20
            ? 'exact_then_whitespace_tolerant_then_indent_flexible'
            : 'exact_then_whitespace_tolerant',
        whyRejected: 'no_match_found',
      })
    }

    const singleEditStartLine =
      replacementIndex >= 0
        ? replaceAll
          ? getLineNumberAtIndex(normalizedContent, scopedRange.charStart)
          : getLineNumberAtIndex(scopedContent, replacementIndex) + scopedRange.startLine - 1
        : 1
    const oldLineCount = normalizedOldString.split('\n').length
    const newLineCount = normalizedNewString.split('\n').length
    const singleEditEndLine =
      singleEditStartLine + Math.max(oldLineCount, newLineCount) - 1
    const usesWholeFileDiff = replaceAll || replacementCount > 1
    const contentChanged = normalizedContent !== nextContent

    if (context.workspaceCheckpointId) {
      await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, normalizedTargetPath)
    }

    await fs.writeFile(normalizedTargetPath, usesCrlf ? nextContent.replace(/\n/g, '\r\n') : nextContent, 'utf8')

    const focusedDiffSnippet = usesWholeFileDiff
      ? null
      : createFocusedDiffSnippet(normalizedContent, nextContent, singleEditStartLine, oldLineCount, newLineCount)
    const operation = contentChanged ? 'edit' : 'noop'
    const message =
      operation === 'edit'
        ? `Edited ${toDisplayPath(relativePath)} successfully.`
        : `Confirmed ${toDisplayPath(relativePath)} already matched the requested edit.`

    return {
      contentChanged,
      contextLines: usesWholeFileDiff ? 5 : focusedDiffSnippet?.contextLines,
      endLineNumber: usesWholeFileDiff ? nextContent.split('\n').length : focusedDiffSnippet?.endLineNumber ?? singleEditEndLine,
      message,
      newContent: usesWholeFileDiff ? nextContent : focusedDiffSnippet?.newContent ?? normalizedNewString,
      oldContent: usesWholeFileDiff ? normalizedContent : focusedDiffSnippet?.oldContent ?? normalizedOldString,
      ok: true,
      operation,
      path: toDisplayPath(relativePath),
      replacementCount,
      startLineNumber: usesWholeFileDiff ? 1 : focusedDiffSnippet?.startLineNumber ?? singleEditStartLine,
      targetKind: 'file',
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
