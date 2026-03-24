import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import {
  parseToolArguments,
  readOptionalBoolean,
  readRequiredString,
  readRequiredText,
  resolveToolPath,
  toDisplayPath,
} from '../filesystemToolUtils'
import { getToolDescription } from '../descriptionCatalog'
import { formatWorkspaceFileContent } from '../workspaceFileFormatter'
import { captureWorkspaceCheckpointFileState } from '../../../../workspace/checkpoints'

const TOOL_DESCRIPTION = getToolDescription('edit')

interface EditOperation {
  [key: string]: unknown
  absolute_path: string
  new_string?: string
  old_string?: string
  replace_all: boolean
}

function normalizeLineEndings(text: string) {
  return text.replace(/\r\n/g, '\n')
}

function detectLineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function convertToLineEnding(text: string, ending: '\n' | '\r\n') {
  if (ending === '\n') {
    return text
  }

  return text.replace(/\n/g, '\r\n')
}

function stripCommonLineNumberPrefixes(text: string) {
  const lines = text.split('\n')
  let strippedLineCount = 0
  const strippedLines = lines.map((line) => {
    if (line.trim().length === 0) {
      return line
    }

    const prefixedLineMatch = line.match(/^\s*\d+\s*(?:\||:)\s?(.*)$/u)
    if (!prefixedLineMatch) {
      return line
    }

    strippedLineCount += 1
    return prefixedLineMatch[1]
  })

  if (strippedLineCount === 0) {
    return text
  }

  const nonEmptyLineCount = lines.filter((line) => line.trim().length > 0).length
  if (strippedLineCount !== nonEmptyLineCount) {
    return text
  }

  return strippedLines.join('\n')
}

function levenshtein(a: string, b: string) {
  if (a.length === 0 || b.length === 0) {
    return Math.max(a.length, b.length)
  }

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, rowIndex) =>
    Array.from({ length: b.length + 1 }, (_, columnIndex) => {
      if (rowIndex === 0) {
        return columnIndex
      }

      if (columnIndex === 0) {
        return rowIndex
      }

      return 0
    }),
  )

  for (let rowIndex = 1; rowIndex <= a.length; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex <= b.length; columnIndex += 1) {
      const cost = a[rowIndex - 1] === b[columnIndex - 1] ? 0 : 1
      matrix[rowIndex][columnIndex] = Math.min(
        matrix[rowIndex - 1][columnIndex] + 1,
        matrix[rowIndex][columnIndex - 1] + 1,
        matrix[rowIndex - 1][columnIndex - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

type Replacer = (content: string, find: string) => Generator<string, void, unknown>

const simpleReplacer: Replacer = function* (_content, find) {
  yield find
}

const lineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n')
  const searchLines = find.split('\n')
  if (searchLines[searchLines.length - 1] === '') {
    searchLines.pop()
  }

  for (let startLine = 0; startLine <= originalLines.length - searchLines.length; startLine += 1) {
    let matches = true
    for (let offset = 0; offset < searchLines.length; offset += 1) {
      if (originalLines[startLine + offset].trim() !== searchLines[offset].trim()) {
        matches = false
        break
      }
    }

    if (!matches) {
      continue
    }

    let startOffset = 0
    for (let lineIndex = 0; lineIndex < startLine; lineIndex += 1) {
      startOffset += originalLines[lineIndex].length + 1
    }

    let endOffset = startOffset
    for (let lineIndex = 0; lineIndex < searchLines.length; lineIndex += 1) {
      endOffset += originalLines[startLine + lineIndex].length
      if (lineIndex < searchLines.length - 1) {
        endOffset += 1
      }
    }

    yield content.slice(startOffset, endOffset)
  }
}

const blockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split('\n')
  const searchLines = find.split('\n')
  if (searchLines[searchLines.length - 1] === '') {
    searchLines.pop()
  }
  if (searchLines.length < 3) {
    return
  }

  const firstLine = searchLines[0].trim()
  const lastLine = searchLines[searchLines.length - 1].trim()
  const candidates: Array<{ endLine: number; startLine: number }> = []
  for (let startLine = 0; startLine < originalLines.length; startLine += 1) {
    if (originalLines[startLine].trim() !== firstLine) {
      continue
    }

    for (let endLine = startLine + 2; endLine < originalLines.length; endLine += 1) {
      if (originalLines[endLine].trim() === lastLine) {
        candidates.push({ endLine, startLine })
        break
      }
    }
  }

  if (candidates.length === 0) {
    return
  }

  const computeSimilarity = (candidate: { endLine: number; startLine: number }) => {
    const blockLineCount = candidate.endLine - candidate.startLine + 1
    const linesToCompare = Math.min(searchLines.length - 2, blockLineCount - 2)
    if (linesToCompare <= 0) {
      return 1
    }

    let similarity = 0
    for (let offset = 1; offset < searchLines.length - 1 && offset < blockLineCount - 1; offset += 1) {
      const originalLine = originalLines[candidate.startLine + offset].trim()
      const searchLine = searchLines[offset].trim()
      const maxLength = Math.max(originalLine.length, searchLine.length)
      if (maxLength === 0) {
        continue
      }

      similarity += 1 - levenshtein(originalLine, searchLine) / maxLength
    }

    return similarity / linesToCompare
  }

  const similarityThreshold = candidates.length === 1 ? 0 : 0.3
  let bestCandidate: { endLine: number; startLine: number } | null = null
  let bestSimilarity = -1

  for (const candidate of candidates) {
    const similarity = computeSimilarity(candidate)
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestCandidate = candidate
    }
  }

  if (!bestCandidate || bestSimilarity < similarityThreshold) {
    return
  }

  let startOffset = 0
  for (let lineIndex = 0; lineIndex < bestCandidate.startLine; lineIndex += 1) {
    startOffset += originalLines[lineIndex].length + 1
  }

  let endOffset = startOffset
  for (let lineIndex = bestCandidate.startLine; lineIndex <= bestCandidate.endLine; lineIndex += 1) {
    endOffset += originalLines[lineIndex].length
    if (lineIndex < bestCandidate.endLine) {
      endOffset += 1
    }
  }

  yield content.slice(startOffset, endOffset)
}

const whitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalizeWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim()
  const normalizedFind = normalizeWhitespace(find)

  const lines = content.split('\n')
  for (const line of lines) {
    const normalizedLine = normalizeWhitespace(line)
    if (normalizedLine === normalizedFind) {
      yield line
      continue
    }

    if (!normalizedLine.includes(normalizedFind)) {
      continue
    }

    const words = find.trim().split(/\s+/).filter((word) => word.length > 0)
    if (words.length === 0) {
      continue
    }

    const escapedPattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    try {
      const match = line.match(new RegExp(escapedPattern))
      if (match?.[0]) {
        yield match[0]
      }
    } catch {
      // ignore invalid regex patterns generated from content
    }
  }

  const findLines = find.split('\n')
  if (findLines.length <= 1) {
    return
  }

  for (let startLine = 0; startLine <= lines.length - findLines.length; startLine += 1) {
    const block = lines.slice(startLine, startLine + findLines.length).join('\n')
    if (normalizeWhitespace(block) === normalizedFind) {
      yield block
    }
  }
}

const indentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndentation = (text: string) => {
    const lines = text.split('\n')
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) {
      return text
    }

    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/u)
        return match ? match[1].length : 0
      }),
    )

    return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join('\n')
  }

  const normalizedFind = removeIndentation(find)
  const contentLines = content.split('\n')
  const findLines = find.split('\n')

  for (let startLine = 0; startLine <= contentLines.length - findLines.length; startLine += 1) {
    const block = contentLines.slice(startLine, startLine + findLines.length).join('\n')
    if (removeIndentation(block) === normalizedFind) {
      yield block
    }
  }
}

const escapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (value: string) =>
    value.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, escapedCharacter) => {
      if (escapedCharacter === 'n') {
        return '\n'
      }
      if (escapedCharacter === 't') {
        return '\t'
      }
      if (escapedCharacter === 'r') {
        return '\r'
      }
      if (escapedCharacter === "'" || escapedCharacter === '"' || escapedCharacter === '`' || escapedCharacter === '\\') {
        return escapedCharacter
      }
      if (escapedCharacter === '\n') {
        return '\n'
      }
      if (escapedCharacter === '$') {
        return '$'
      }
      return match
    })

  const unescapedFind = unescapeString(find)
  if (content.includes(unescapedFind)) {
    yield unescapedFind
  }

  const lines = content.split('\n')
  const findLines = unescapedFind.split('\n')
  for (let startLine = 0; startLine <= lines.length - findLines.length; startLine += 1) {
    const block = lines.slice(startLine, startLine + findLines.length).join('\n')
    if (unescapeString(block) === unescapedFind) {
      yield block
    }
  }
}

const trimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()
  if (trimmedFind === find) {
    return
  }

  if (content.includes(trimmedFind)) {
    yield trimmedFind
  }

  const lines = content.split('\n')
  const findLines = find.split('\n')
  for (let startLine = 0; startLine <= lines.length - findLines.length; startLine += 1) {
    const block = lines.slice(startLine, startLine + findLines.length).join('\n')
    if (block.trim() === trimmedFind) {
      yield block
    }
  }
}

const contextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split('\n')
  if (findLines[findLines.length - 1] === '') {
    findLines.pop()
  }

  if (findLines.length < 3) {
    return
  }

  const firstLine = findLines[0].trim()
  const lastLine = findLines[findLines.length - 1].trim()
  const contentLines = content.split('\n')

  for (let startLine = 0; startLine < contentLines.length; startLine += 1) {
    if (contentLines[startLine].trim() !== firstLine) {
      continue
    }

    for (let endLine = startLine + 2; endLine < contentLines.length; endLine += 1) {
      if (contentLines[endLine].trim() !== lastLine) {
        continue
      }

      const blockLines = contentLines.slice(startLine, endLine + 1)
      if (blockLines.length !== findLines.length) {
        break
      }

      let matchingLines = 0
      let comparableLines = 0
      for (let offset = 1; offset < blockLines.length - 1; offset += 1) {
        const blockLine = blockLines[offset].trim()
        const findLine = findLines[offset].trim()
        if (blockLine.length > 0 || findLine.length > 0) {
          comparableLines += 1
          if (blockLine === findLine) {
            matchingLines += 1
          }
        }
      }

      if (comparableLines === 0 || matchingLines / comparableLines >= 0.5) {
        yield blockLines.join('\n')
      }
      break
    }
  }
}

const multiOccurrenceReplacer: Replacer = function* (content, find) {
  let cursor = 0
  while (true) {
    const index = content.indexOf(find, cursor)
    if (index < 0) {
      break
    }

    yield find
    cursor = index + find.length
  }
}

function replaceWithAnchors(content: string, oldString: string, newString: string, replaceAll: boolean) {
  if (oldString === newString) {
    throw new OpenAICompatibleToolError('No changes to apply: old_string and new_string are identical.')
  }

  let anyMatch = false
  const replacers: Replacer[] = [
    simpleReplacer,
    lineTrimmedReplacer,
    blockAnchorReplacer,
    whitespaceNormalizedReplacer,
    indentationFlexibleReplacer,
    escapeNormalizedReplacer,
    trimmedBoundaryReplacer,
    contextAwareReplacer,
    multiOccurrenceReplacer,
  ]

  for (const replacer of replacers) {
    for (const candidateSearchText of replacer(content, oldString)) {
      const firstIndex = content.indexOf(candidateSearchText)
      if (firstIndex < 0) {
        continue
      }

      anyMatch = true
      if (replaceAll) {
        return content.split(candidateSearchText).join(newString)
      }

      const lastIndex = content.lastIndexOf(candidateSearchText)
      if (firstIndex !== lastIndex) {
        continue
      }

      return `${content.slice(0, firstIndex)}${newString}${content.slice(firstIndex + candidateSearchText.length)}`
    }
  }

  if (!anyMatch) {
    throw new OpenAICompatibleToolError(
      'Could not find old_string in file content. Provide more exact context or include surrounding lines.',
    )
  }

  throw new OpenAICompatibleToolError(
    'Found multiple matches for old_string. Add more unique surrounding context or set replace_all to true.',
  )
}

function normalizeEditOperation(input: Record<string, unknown>): EditOperation {
  const absolutePath = readRequiredString(input, 'absolute_path')
  const replaceAll = readOptionalBoolean(input, 'replace_all', false)
  const oldString = readRequiredText(input, 'old_string', true)
  const newString = readRequiredText(input, 'new_string', true)
  return {
    absolute_path: absolutePath,
    new_string: newString,
    old_string: oldString,
    replace_all: replaceAll,
  }
}

function parseEditArguments(argumentsText: string): EditOperation {
  const parsedValue = parseToolArguments(argumentsText)
  const editsValue = parsedValue.edits
  if (Array.isArray(editsValue)) {
    if (editsValue.length === 0) {
      throw new OpenAICompatibleToolError('Edit requires a single operation object. `edits` cannot be empty.')
    }

    if (editsValue.length > 1) {
      throw new OpenAICompatibleToolError(
        'Edit accepts a single operation per call. Use parallel tool calls for multiple edits.',
      )
    }

    const editValue = editsValue[0]
    if (typeof editValue !== 'object' || editValue === null || Array.isArray(editValue)) {
      throw new OpenAICompatibleToolError('Each edit must be an object.', {
        editIndex: 0,
      })
    }

    return normalizeEditOperation(editValue as Record<string, unknown>)
  }

  return normalizeEditOperation(parsedValue)
}

async function readExistingFile(absolutePath: string) {
  try {
    const stat = await fs.stat(absolutePath)
    if (!stat.isFile()) {
      throw new OpenAICompatibleToolError('absolute_path must point to a file.', {
        absolute_path: absolutePath,
      })
    }

    return {
      exists: true,
      content: await fs.readFile(absolutePath, 'utf8'),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        exists: false,
        content: '',
      }
    }

    throw error
  }
}

export const editTool: OpenAICompatibleToolDefinition = {
  executionMode: 'path-exclusive',
  name: 'edit',
  parseArguments: parseEditArguments,
  async execute(argumentsValue, context) {
    const edit = parseEditArguments(JSON.stringify(argumentsValue))
    const trackedCheckpointPaths = new Set<string>()
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, edit.absolute_path)
    const existingFile = await readExistingFile(normalizedTargetPath)
    const oldString = edit.old_string ?? ''
    const newString = edit.new_string ?? ''
    let nextContent: string

    if (!existingFile.exists && oldString.length > 0) {
      throw new OpenAICompatibleToolError('Cannot apply edit because file does not exist and old_string is non-empty.', {
        absolute_path: normalizedTargetPath,
      })
    }

    if (oldString.length === 0) {
      nextContent = newString
    } else {
      const lineEnding = detectLineEnding(existingFile.content)
      const normalizedOldString = convertToLineEnding(normalizeLineEndings(oldString), lineEnding)
      const normalizedNewString = convertToLineEnding(normalizeLineEndings(newString), lineEnding)
      const normalizedOldStringWithoutLineNumbers = stripCommonLineNumberPrefixes(normalizedOldString)

      try {
        nextContent = replaceWithAnchors(existingFile.content, normalizedOldString, normalizedNewString, edit.replace_all)
      } catch (error) {
        const shouldRetryWithStrippedLineNumbers =
          error instanceof OpenAICompatibleToolError &&
          error.message.includes('Could not find old_string in file content') &&
          normalizedOldStringWithoutLineNumbers !== normalizedOldString

        if (!shouldRetryWithStrippedLineNumbers) {
          throw error
        }

        nextContent = replaceWithAnchors(
          existingFile.content,
          normalizedOldStringWithoutLineNumbers,
          normalizedNewString,
          edit.replace_all,
        )
      }
    }

    if (context.workspaceCheckpointId && !trackedCheckpointPaths.has(normalizedTargetPath)) {
      await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, normalizedTargetPath)
      trackedCheckpointPaths.add(normalizedTargetPath)
    }

    const formattedNextContent = await formatWorkspaceFileContent(
      normalizedTargetPath,
      nextContent,
      existingFile.content.includes('\r\n') ? '\r\n' : '\n',
    )

    await fs.mkdir(path.dirname(normalizedTargetPath), { recursive: true })
    await fs.writeFile(normalizedTargetPath, formattedNextContent, 'utf8')

    const displayPath = toDisplayPath(relativePath)
    const addedPathList = existingFile.exists ? [] : [displayPath]
    const modifiedPathList = existingFile.exists ? [displayPath] : []
    const deletedPathList: string[] = []
    const changedPathList = Array.from(new Set([...addedPathList, ...modifiedPathList]))
    const contentChanged = existingFile.content !== formattedNextContent
    const singleChangedPath = changedPathList.length === 1 ? changedPathList[0] : null

    const message =
      changedPathList.length === 0
        ? 'Edit completed with no file changes.'
        : singleChangedPath
          ? `Edited ${singleChangedPath} successfully.`
          : `Edited ${changedPathList.length} files successfully.`

    return {
      addedPaths: addedPathList,
      changeCount: 1,
      contentChanged,
      deletedPaths: deletedPathList,
      endLineNumber: undefined,
      message,
      modifiedPaths: modifiedPathList,
      ...(singleChangedPath
        ? {
            newContent: formattedNextContent,
            oldContent: existingFile.exists ? existingFile.content : null,
          }
        : {}),
      ok: true,
      operation: changedPathList.length === 0 ? 'noop' : 'edit',
      path: singleChangedPath ?? '.',
      startLineNumber: undefined,
      targetKind: changedPathList.length <= 1 ? 'file' : 'workspace',
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'edit',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: { type: 'string' },
          old_string: { type: 'string' },
          replace_all: { type: 'boolean' },
          new_string: { type: 'string' },
        },
        required: ['absolute_path', 'old_string', 'new_string'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
