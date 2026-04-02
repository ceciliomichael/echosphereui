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

export interface ApplyPatchLineRange {
  endLine: number
  path: string
  startLine: number
}

export interface ApplyPatchOptions {
  beforeCommit?: (changes: readonly ApplyPatchChange[]) => Promise<void> | void
  lineRanges?: ApplyPatchLineRange[]
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

type ComparisonMode = 'exact' | 'rstrip' | 'trim' | 'normalized'

interface PlannedOperation {
  change: ApplyPatchChange
  commit: () => Promise<void>
}

interface NormalizedLineRange {
  endLine: number
  path: string
  startLine: number
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new PatchApplicationError(message, details)
}

function normalizePatchText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function stripReadLineNumberPrefixesFromPatch(patchText: string) {
  return patchText
    .split('\n')
    .map((line) => {
      const diffPrefix = line[0]
      if (diffPrefix !== ' ' && diffPrefix !== '+' && diffPrefix !== '-') {
        return line
      }

      const withoutDiffPrefix = line.slice(1)
      const prefixedLineMatch = withoutDiffPrefix.match(/^\s*\d+\s*\|\s?(.*)$/u)
      if (!prefixedLineMatch) {
        return line
      }

      return `${diffPrefix}${prefixedLineMatch[1]}`
    })
    .join('\n')
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

function normalizeLineRanges(lineRanges: ApplyPatchLineRange[] | undefined, cwd: string) {
  if (!lineRanges || lineRanges.length === 0) {
    return new Map<string, NormalizedLineRange>()
  }

  const normalized = new Map<string, NormalizedLineRange>()
  for (const lineRange of lineRanges) {
    const normalizedPath = ensureWorkspacePath(lineRange.path, 'line_ranges path', cwd)
    if (normalized.has(normalizedPath)) {
      fail(`Duplicate line_ranges entry for ${normalizedPath}.`)
    }

    normalized.set(normalizedPath, {
      endLine: lineRange.endLine,
      path: normalizedPath,
      startLine: lineRange.startLine,
    })
  }

  return normalized
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

function normalizeUnicode(text: string) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
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

function normalizeComparableLine(line: string, mode: ComparisonMode) {
  const strippedLine = stripCommonLineNumberPrefix(line)

  if (mode === 'exact') {
    return strippedLine
  }

  if (mode === 'rstrip') {
    return strippedLine.trimEnd()
  }

  if (mode === 'trim') {
    return strippedLine.trim()
  }

  return normalizeUnicode(strippedLine.trim())
}

function linesMatchByMode(actualLine: string, expectedLine: string, mode: ComparisonMode) {
  return normalizeComparableLine(actualLine, mode) === normalizeComparableLine(expectedLine, mode)
}

function tryMatch(
  lines: string[],
  needleLines: string[],
  startIndex: number,
  endIndex: number,
  mode: ComparisonMode,
  eof: boolean,
) {
  const searchableEndIndex = Math.min(endIndex, lines.length)
  if (needleLines.length === 0) {
    return -1
  }

  if (eof) {
    const fromEnd = searchableEndIndex - needleLines.length
    if (fromEnd >= startIndex) {
      let matches = true
      for (let offset = 0; offset < needleLines.length; offset += 1) {
        if (!linesMatchByMode(lines[fromEnd + offset], needleLines[offset], mode)) {
          matches = false
          break
        }
      }

      if (matches) {
        return fromEnd
      }
    }
  }

  for (let index = startIndex; index <= searchableEndIndex - needleLines.length; index += 1) {
    let matches = true
    for (let offset = 0; offset < needleLines.length; offset += 1) {
      if (!linesMatchByMode(lines[index + offset], needleLines[offset], mode)) {
        matches = false
        break
      }
    }

    if (matches) {
      return index
    }
  }

  return -1
}

function seekSequence(
  lines: string[],
  needleLines: string[],
  startIndex: number,
  endIndex: number,
  eof = false,
) {
  if (needleLines.length === 0) {
    return -1
  }

  const modes: ComparisonMode[] = ['exact', 'rstrip', 'trim', 'normalized']
  for (const mode of modes) {
    const found = tryMatch(lines, needleLines, startIndex, endIndex, mode, eof)
    if (found !== -1) {
      return found
    }
  }

  return -1
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
  const normalizedPatch = stripReadLineNumberPrefixesFromPatch(normalizePatchText(patchText))
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
      fail('apply_patch only supports editing existing files. Use the edit or write tool for file creation.')
    }

    if (trimmed.startsWith(DELETE_FILE_MARKER)) {
      fail('apply_patch only supports editing existing files. Use the edit or write tool for file deletion.')
    }

    if (trimmed.startsWith(UPDATE_FILE_MARKER)) {
      const filePath = ensureWorkspacePath(trimmed.slice(UPDATE_FILE_MARKER.length), 'Update File', cwd)
      index += 1
      const moveTo: string | null = null

      if (index < lines.length - 1 && lines[index].trim().startsWith(MOVE_TO_MARKER)) {
        fail('apply_patch only supports editing existing files. Move the file with a separate filesystem operation.')
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
  eof = false,
) {
  if (needleLines.length === 0) {
    fail('Cannot search for an empty block.')
  }

  const matchIndex = seekSequence(lines, needleLines, startIndex, endIndex, eof)
  return matchIndex === -1 ? null : matchIndex
}

async function readExistingContent(filePath: string): Promise<{ content: string; exists: boolean }> {
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

async function readVirtualContent(
  filePath: string,
  cwd: string,
  virtualContents: Map<string, string | null>,
): Promise<{ content: string | null; exists: boolean }> {
  if (virtualContents.has(filePath)) {
    const content = virtualContents.get(filePath)
    return content === null || content === undefined
      ? { content: null, exists: false }
      : { content, exists: true }
  }

  const existing = await readExistingContent(path.resolve(cwd, filePath))
  const content = existing.exists ? existing.content : null
  virtualContents.set(filePath, content)
  return { content, exists: existing.exists }
}

async function applyAddOperation(
  operation: ParsedAddOperation,
  cwd: string,
  virtualContents: Map<string, string | null>,
) {
  const targetPath = path.resolve(cwd, operation.path)
  const existing = await readVirtualContent(operation.path, cwd, virtualContents)

  virtualContents.set(operation.path, operation.contents)

  return {
    change: {
      fileName: operation.path,
      kind: existing.exists ? 'update' : 'add',
      newContent: operation.contents,
      oldContent: existing.content,
    } satisfies ApplyPatchChange,
    commit: async () => {
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, joinContent(splitContent(operation.contents), '\n'), 'utf8')
    },
  } satisfies PlannedOperation
}

async function applyDeleteOperation(
  operation: ParsedDeleteOperation,
  cwd: string,
  virtualContents: Map<string, string | null>,
) {
  const targetPath = path.resolve(cwd, operation.path)
  const existing = await readVirtualContent(operation.path, cwd, virtualContents)

  if (!existing.exists) {
    fail(`Cannot delete missing file: ${operation.path}`)
  }

  virtualContents.set(operation.path, null)
  return {
    change: {
      fileName: operation.path,
      kind: 'delete',
      newContent: null,
      oldContent: existing.content,
    } satisfies ApplyPatchChange,
    commit: async () => {
      await fs.unlink(targetPath)
    },
  } satisfies PlannedOperation
}

async function applyUpdateOperation(
  operation: ParsedUpdateOperation,
  cwd: string,
  virtualContents: Map<string, string | null>,
  lineRanges: Map<string, NormalizedLineRange>,
) {
  const sourcePath = path.resolve(cwd, operation.path)
  const existing = await readVirtualContent(operation.path, cwd, virtualContents)

  if (!existing.exists || existing.content === null) {
    fail(`Cannot update missing file: ${operation.path}`)
  }

  const lineEnding = detectLineEnding(existing.content)
  let lines = splitContent(existing.content.replace(/\r\n/g, '\n'))
  const lineRange = lineRanges.get(operation.path)
  const rangeStartIndex = lineRange ? lineRange.startLine - 1 : 0
  let rangeEndLine = lineRange ? lineRange.endLine : Number.MAX_SAFE_INTEGER
  let searchStart = rangeStartIndex
  let mustRemoveTrailingNewline = false

  for (const hunk of operation.hunks) {
    const logicalLength = effectiveLineCount(lines)
    const searchEnd = Math.min(logicalLength, rangeEndLine)
    const { endOfFile } = hunkToReplacement(hunk)
    let { newLines, oldLines } = hunkToReplacement(hunk)
    let matchIndex = findUniqueBlock(lines, oldLines, searchStart, searchEnd, endOfFile)

    if (matchIndex === null && oldLines.length > 0 && oldLines.at(-1) === '') {
      oldLines = oldLines.slice(0, -1)
      if (newLines.length > 0 && newLines.at(-1) === '') {
        newLines = newLines.slice(0, -1)
      }
      matchIndex = findUniqueBlock(lines, oldLines, searchStart, searchEnd, endOfFile)
    }

    if (matchIndex === null) {
      const diagnostics = collectBlockSearchDiagnostics(lines, oldLines, searchStart, searchEnd)
      fail(`Could not find the hunk context in ${operation.path}. Add more surrounding lines.`, {
        ...diagnostics,
        failureReason: 'hunk_context_mismatch',
        filePath: operation.path,
        ...(lineRange
          ? {
              lineRangeEndLine: lineRange.endLine,
              lineRangeStartLine: lineRange.startLine,
            }
          : {}),
        resolvedPath: sourcePath,
      })
    }

    const matchEnd = matchIndex + oldLines.length
    if (endOfFile && matchEnd !== logicalLength) {
      fail(`The end-of-file hunk for ${operation.path} must match the end of the file.`)
    }

    lines = [...lines.slice(0, matchIndex), ...newLines, ...lines.slice(matchEnd)]
    if (lineRange) {
      const lineDelta = newLines.length - oldLines.length
      rangeEndLine += lineDelta
    }
    searchStart = matchIndex + newLines.length
    mustRemoveTrailingNewline ||= endOfFile
  }

  let nextContent = joinContent(lines, lineEnding)
  if (mustRemoveTrailingNewline && nextContent.endsWith(lineEnding)) {
    nextContent = nextContent.slice(0, -lineEnding.length)
  }
  const destinationPath = operation.moveTo ? path.resolve(cwd, operation.moveTo) : sourcePath

  virtualContents.set(operation.path, null)
  virtualContents.set(operation.moveTo ?? operation.path, nextContent)

  return {
    change: {
      fileName: operation.moveTo ?? operation.path,
      kind: 'update',
      newContent: nextContent,
      oldContent: existing.content,
      sourcePath: operation.moveTo ? operation.path : null,
    } satisfies ApplyPatchChange,
    commit: async () => {
      if (destinationPath !== sourcePath) {
        await fs.mkdir(path.dirname(destinationPath), { recursive: true })
        await fs.writeFile(destinationPath, nextContent, 'utf8')
        await fs.unlink(sourcePath)
        return
      }

      await fs.writeFile(sourcePath, nextContent, 'utf8')
    },
  } satisfies PlannedOperation
}

export async function applyPatchText(
  patchText: string,
  cwd = process.cwd(),
  options: ApplyPatchOptions = {},
): Promise<ApplyPatchResult> {
  const operations = parsePatchText(patchText, cwd)
  const lineRanges = normalizeLineRanges(options.lineRanges, cwd)
  const updateOperationPaths = new Set(
    operations.filter((operation): operation is ParsedUpdateOperation => operation.kind === 'update').map((operation) => operation.path),
  )
  for (const lineRangePath of lineRanges.keys()) {
    if (!updateOperationPaths.has(lineRangePath)) {
      fail(`line_ranges path is not present in the patch: ${lineRangePath}`)
    }
  }
  const changes: ApplyPatchChange[] = []
  const plannedOperations: PlannedOperation[] = []
  const virtualContents = new Map<string, string | null>()

  for (const operation of operations) {
    if (operation.kind === 'add') {
      const planned = await applyAddOperation(operation, cwd, virtualContents)
      plannedOperations.push(planned)
      changes.push(planned.change)
      continue
    }

    if (operation.kind === 'delete') {
      const planned = await applyDeleteOperation(operation, cwd, virtualContents)
      plannedOperations.push(planned)
      changes.push(planned.change)
      continue
    }

    const planned = await applyUpdateOperation(operation, cwd, virtualContents, lineRanges)
    plannedOperations.push(planned)
    changes.push(planned.change)
  }

  await options.beforeCommit?.(changes)

  for (const planned of plannedOperations) {
    await planned.commit()
  }

  return { changes }
}
