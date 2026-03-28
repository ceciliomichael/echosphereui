import { promises as fs } from 'node:fs'
import path from 'node:path'

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const EOF_MARKER = '*** End of File'

interface ParsedAddOperation {
  kind: 'add'
  contents: string
  path: string
}

interface ParsedDeleteOperation {
  kind: 'delete'
  path: string
}

interface ParsedUpdateHunk {
  endOfFile: boolean
  lines: string[]
}

interface ParsedUpdateOperation {
  hunkCount: number
  kind: 'update'
  moveTo: string | null
  path: string
  hunks: ParsedUpdateHunk[]
}

type ParsedPatchOperation = ParsedAddOperation | ParsedDeleteOperation | ParsedUpdateOperation

export class PatchApplicationError extends Error {
  details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'PatchApplicationError'
    this.details = details
  }
}

export interface ApplyPatchChange {
  fileName: string
  kind: 'add' | 'delete' | 'update'
  newContent: string | null
  oldContent: string | null
  sourcePath?: string | null
}

export interface ApplyPatchResult {
  changes: ApplyPatchChange[]
}

interface BlockSearchDiagnostics {
  bestPartialMatchLine: number | null
  bestPartialMatchPreview: string
  bestPartialMatchPrefixLength: number
  exactMatchCount: number
  exactMatchLines: string
  fileLineCount: number
  firstContextLine: string
  firstContextLineMatchCount: number
  firstContextLineMatchLines: string
  hunkContext: string
  hunkLineCount: number
  searchEndLine: number
  searchStartLine: number
  searchWindowPreview: string
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new PatchApplicationError(message, details)
}

function normalizePatchText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function hasTopLevelMarker(line: string) {
  const trimmed = line.trim()
  return (
    !/^[ \t]/.test(line) &&
    (trimmed === END_PATCH_MARKER ||
      trimmed === EOF_MARKER ||
      trimmed.startsWith(ADD_FILE_MARKER) ||
      trimmed.startsWith(DELETE_FILE_MARKER) ||
      trimmed.startsWith(UPDATE_FILE_MARKER))
  )
}

function ensureWorkspacePath(rawPath: string, kind: string, cwd: string) {
  const trimmedPath = rawPath.trim()
  if (trimmedPath.length === 0) {
    fail(`${kind} path must not be empty.`)
  }

  const resolvedPath = path.resolve(cwd, trimmedPath)
  const relativePath = path.relative(cwd, resolvedPath)
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    fail(`${kind} path must stay inside the current working directory.`)
  }

  return relativePath.replace(/\\/g, '/')
}

function splitContent(text: string) {
  return text.length === 0 ? [] : text.split('\n')
}

function joinContent(lines: string[], lineEnding: '\n' | '\r\n') {
  return lines.join(lineEnding)
}

function detectLineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function effectiveLineCount(lines: string[]) {
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.length - 1
  }

  return lines.length
}

function stripCommonLineNumberPrefix(line: string) {
  const prefixedLineMatch = line.match(/^\s*\d+\s*(?:\||:)\s?(.*)$/u)
  return prefixedLineMatch ? prefixedLineMatch[1] : line
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function formatLinePreview(lines: string[], centerIndex: number, radius: number) {
  if (lines.length === 0) {
    return 'No file content available.'
  }

  const startIndex = Math.max(0, centerIndex - radius)
  const endIndex = Math.min(lines.length, centerIndex + radius + 1)

  return lines
    .slice(startIndex, endIndex)
    .map((line, offset) => `${startIndex + offset + 1}: ${line}`)
    .join('\n')
}

function compareLines(actualLine: string, expectedLine: string) {
  if (actualLine === expectedLine) {
    return true
  }

  if (actualLine.trim() === expectedLine.trim()) {
    return true
  }

  if (normalizeWhitespace(actualLine) === normalizeWhitespace(expectedLine)) {
    return true
  }

  const strippedActualLine = stripCommonLineNumberPrefix(actualLine)
  const strippedExpectedLine = stripCommonLineNumberPrefix(expectedLine)
  if (strippedActualLine === strippedExpectedLine) {
    return true
  }

  return normalizeWhitespace(strippedActualLine) === normalizeWhitespace(strippedExpectedLine)
}

function collectBlockSearchDiagnostics(
  lines: string[],
  needleLines: string[],
  startIndex: number,
  endIndex: number,
): BlockSearchDiagnostics {
  const exactMatchLines: number[] = []
  const firstContextLineMatchLines: number[] = []
  let bestPartialMatchLine: number | null = null
  let bestPartialMatchPrefixLength = 0

  for (let index = startIndex; index <= endIndex - needleLines.length; index += 1) {
    let matchedPrefixLength = 0

    for (let offset = 0; offset < needleLines.length; offset += 1) {
      if (!compareLines(lines[index + offset], needleLines[offset])) {
        break
      }

      matchedPrefixLength += 1
    }

    if (matchedPrefixLength > 0) {
      firstContextLineMatchLines.push(index)
    }

    if (matchedPrefixLength > bestPartialMatchPrefixLength) {
      bestPartialMatchPrefixLength = matchedPrefixLength
      bestPartialMatchLine = index
    }

    if (matchedPrefixLength === needleLines.length) {
      exactMatchLines.push(index)
      if (exactMatchLines.length > 1) {
        break
      }
    }
  }

  const previewLine = bestPartialMatchLine ?? startIndex
  const previewRadius = Math.max(2, needleLines.length + 1)

  return {
    bestPartialMatchLine: bestPartialMatchLine === null ? null : bestPartialMatchLine + 1,
    bestPartialMatchPreview: formatLinePreview(lines, previewLine, previewRadius),
    bestPartialMatchPrefixLength,
    exactMatchCount: exactMatchLines.length,
    exactMatchLines: exactMatchLines.length > 0 ? exactMatchLines.map((lineIndex) => lineIndex + 1).join(', ') : 'none',
    fileLineCount: endIndex,
    firstContextLine: needleLines[0] ?? '',
    firstContextLineMatchCount: firstContextLineMatchLines.length,
    firstContextLineMatchLines:
      firstContextLineMatchLines.length > 0
        ? firstContextLineMatchLines.map((lineIndex) => lineIndex + 1).join(', ')
        : 'none',
    hunkContext: needleLines.join('\n'),
    hunkLineCount: needleLines.length,
    searchEndLine: endIndex,
    searchStartLine: startIndex + 1,
    searchWindowPreview: formatLinePreview(lines, startIndex, previewRadius),
  }
}

function parsePatchText(patchText: string, cwd: string) {
  const normalizedPatch = normalizePatchText(patchText)
  if (normalizedPatch.length === 0) {
    fail('apply_patch requires a non-empty patch.')
  }

  const lines = normalizedPatch.split('\n')
  if (lines[0]?.trim() !== BEGIN_PATCH_MARKER) {
    fail("The first line of the patch must be '*** Begin Patch'.")
  }

  if (lines.at(-1)?.trim() !== END_PATCH_MARKER) {
    fail("The last line of the patch must be '*** End Patch'.")
  }

  const operations: ParsedPatchOperation[] = []
  let index = 1

  while (index < lines.length - 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      index += 1
      continue
    }

    if (trimmed.startsWith(ADD_FILE_MARKER)) {
      const filePath = ensureWorkspacePath(trimmed.slice(ADD_FILE_MARKER.length), 'Add File', cwd)
      index += 1
      const contents: string[] = []

      while (index < lines.length - 1) {
        const currentLine = lines[index]
        const currentTrimmed = currentLine.trim()
        if (hasTopLevelMarker(currentLine) || currentTrimmed === END_PATCH_MARKER) {
          break
        }

        if (!currentLine.startsWith('+')) {
          fail(`Add File lines must start with '+'. Got: ${currentLine}`)
        }

        contents.push(currentLine.slice(1))
        index += 1
      }

      if (contents.length === 0) {
        fail(`Add File for ${filePath} must include at least one '+...' line.`)
      }

      operations.push({
        contents: contents.join('\n'),
        kind: 'add',
        path: filePath,
      })
      continue
    }

    if (trimmed.startsWith(DELETE_FILE_MARKER)) {
      operations.push({
        kind: 'delete',
        path: ensureWorkspacePath(trimmed.slice(DELETE_FILE_MARKER.length), 'Delete File', cwd),
      })
      index += 1
      continue
    }

    if (trimmed.startsWith(UPDATE_FILE_MARKER)) {
      const filePath = ensureWorkspacePath(trimmed.slice(UPDATE_FILE_MARKER.length), 'Update File', cwd)
      index += 1
      let moveTo: string | null = null

      if (index < lines.length - 1 && lines[index].trim().startsWith(MOVE_TO_MARKER)) {
        moveTo = ensureWorkspacePath(lines[index].trim().slice(MOVE_TO_MARKER.length), 'Move to', cwd)
        index += 1
      }

      const hunks: ParsedUpdateHunk[] = []
      while (index < lines.length - 1) {
        const currentLine = lines[index]
        const currentTrimmed = currentLine.trim()

        if (currentTrimmed.length === 0) {
          index += 1
          continue
        }

        if (hasTopLevelMarker(currentLine) || currentTrimmed === END_PATCH_MARKER) {
          break
        }

        if (!currentTrimmed.startsWith('@@')) {
          fail(`Update File hunks must start with '@@'. Got: ${currentLine}`)
        }

        index += 1
        const hunkLines: string[] = []
        let endOfFile = false

        while (index < lines.length - 1) {
          const hunkLine = lines[index]
          const hunkTrimmed = hunkLine.trim()

          if (hunkTrimmed === EOF_MARKER) {
            endOfFile = true
            index += 1
            break
          }

          if (hunkTrimmed.startsWith('@@') || hasTopLevelMarker(hunkLine) || hunkTrimmed === END_PATCH_MARKER) {
            break
          }

          if (hunkLine.length === 0) {
            fail('Patch hunk lines must be prefixed with one of " ", "-", or "+".')
          }

          const prefix = hunkLine[0]
          if (prefix !== ' ' && prefix !== '-' && prefix !== '+') {
            fail(`Patch hunk lines must start with a diff prefix. Got: ${hunkLine}`)
          }

          hunkLines.push(hunkLine)
          index += 1
        }

        hunks.push({
          endOfFile,
          lines: hunkLines,
        })
      }

      if (hunks.length === 0) {
        fail(`Update File for ${filePath} must include at least one hunk.`)
      }

      operations.push({
        hunkCount: hunks.length,
        hunks,
        kind: 'update',
        moveTo,
        path: filePath,
      })
      continue
    }

    fail(`Unexpected patch line: ${line}`)
  }

  if (operations.length === 0) {
    fail('apply_patch requires at least one file operation.')
  }

  return operations
}

function hunkToReplacement(hunk: ParsedUpdateHunk) {
  const oldLines: string[] = []
  const newLines: string[] = []

  for (const line of hunk.lines) {
    const prefix = line[0]
    const value = line.slice(1)

    if (prefix === ' ') {
      oldLines.push(value)
      newLines.push(value)
      continue
    }

    if (prefix === '-') {
      oldLines.push(value)
      continue
    }

    if (prefix === '+') {
      newLines.push(value)
      continue
    }

    fail(`Invalid hunk line: ${line}`)
  }

  if (oldLines.length === 0) {
    fail('Update hunks must include at least one context or removal line.')
  }

  return { endOfFile: hunk.endOfFile, newLines, oldLines }
}

function findUniqueBlock(
  lines: string[],
  needleLines: string[],
  startIndex: number,
  endIndex: number,
  filePath?: string,
  resolvedPath?: string,
) {
  if (needleLines.length === 0) {
    fail('Cannot search for an empty block.')
  }

  const matches: number[] = []
  for (let index = startIndex; index <= endIndex - needleLines.length; index += 1) {
    let matched = true
    for (let offset = 0; offset < needleLines.length; offset += 1) {
      if (!compareLines(lines[index + offset], needleLines[offset])) {
        matched = false
        break
      }
    }

    if (matched) {
      matches.push(index)
      if (matches.length > 1) {
        break
      }
    }
  }

  if (matches.length === 0) {
    return null
  }

  if (matches.length > 1) {
    const diagnostics = collectBlockSearchDiagnostics(lines, needleLines, startIndex, endIndex)
    fail('Found multiple matches for update hunk context. Add more surrounding lines.', {
      ...diagnostics,
      ...(filePath === undefined ? {} : { filePath }),
      ...(resolvedPath === undefined ? {} : { resolvedPath }),
    })
  }

  return matches[0]
}

async function readExistingContent(filePath: string) {
  try {
    const stats = await fs.stat(filePath)
    if (!stats.isFile()) {
      fail(`Path is not a file: ${filePath}`)
    }

    return {
      exists: true,
      content: await fs.readFile(filePath, 'utf8'),
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

function applyAddOperation(operation: ParsedAddOperation, cwd: string) {
  const targetPath = path.resolve(cwd, operation.path)
  const existing = fs.readFile(targetPath, 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  })

  return existing.then(async (oldContent) => {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.writeFile(targetPath, joinContent(splitContent(operation.contents), '\n'), 'utf8')

    return {
      fileName: operation.path,
      kind: oldContent === null ? 'add' : 'update',
      newContent: operation.contents,
      oldContent,
    } satisfies ApplyPatchChange
  })
}

async function applyDeleteOperation(operation: ParsedDeleteOperation, cwd: string) {
  const targetPath = path.resolve(cwd, operation.path)
  const existing = await readExistingContent(targetPath)

  if (!existing.exists) {
    fail(`Cannot delete missing file: ${operation.path}`)
  }

  await fs.unlink(targetPath)
  return {
    fileName: operation.path,
    kind: 'delete',
    newContent: null,
    oldContent: existing.content,
  } satisfies ApplyPatchChange
}

async function applyUpdateOperation(operation: ParsedUpdateOperation, cwd: string) {
  const sourcePath = path.resolve(cwd, operation.path)
  const existing = await readExistingContent(sourcePath)

  if (!existing.exists) {
    fail(`Cannot update missing file: ${operation.path}`)
  }

  const lineEnding = detectLineEnding(existing.content)
  let lines = splitContent(existing.content.replace(/\r\n/g, '\n'))
  let searchStart = 0

  for (const hunk of operation.hunks) {
    const logicalLength = effectiveLineCount(lines)
    const { endOfFile, newLines, oldLines } = hunkToReplacement(hunk)
    const matchIndex = findUniqueBlock(lines, oldLines, searchStart, logicalLength, operation.path, sourcePath)

    if (matchIndex === null) {
      const diagnostics = collectBlockSearchDiagnostics(lines, oldLines, searchStart, logicalLength)
      fail(`Could not find the hunk context in ${operation.path}. Add more surrounding lines.`, {
        ...diagnostics,
        filePath: operation.path,
        resolvedPath: sourcePath,
      })
    }

    const matchEnd = matchIndex + oldLines.length
    if (endOfFile && matchEnd !== logicalLength) {
      fail(`The end-of-file hunk for ${operation.path} must match the end of the file.`)
    }

    lines = [...lines.slice(0, matchIndex), ...newLines, ...lines.slice(matchEnd)]
    searchStart = matchIndex + newLines.length
  }

  const nextContent = joinContent(lines, lineEnding)
  const destinationPath = operation.moveTo ? path.resolve(cwd, operation.moveTo) : sourcePath

  if (destinationPath !== sourcePath) {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.writeFile(destinationPath, nextContent, 'utf8')
    await fs.unlink(sourcePath)
  } else {
    await fs.writeFile(sourcePath, nextContent, 'utf8')
  }

  return {
    fileName: operation.moveTo ?? operation.path,
    kind: 'update',
    newContent: nextContent,
    oldContent: existing.content,
    sourcePath: operation.moveTo ? operation.path : null,
  } satisfies ApplyPatchChange
}

export async function applyPatchText(patchText: string, cwd = process.cwd()): Promise<ApplyPatchResult> {
  const operations = parsePatchText(patchText, cwd)
  const changes: ApplyPatchChange[] = []

  for (const operation of operations) {
    if (operation.kind === 'add') {
      changes.push(await applyAddOperation(operation, cwd))
      continue
    }

    if (operation.kind === 'delete') {
      changes.push(await applyDeleteOperation(operation, cwd))
      continue
    }

    changes.push(await applyUpdateOperation(operation, cwd))
  }

  return { changes }
}
