#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const EOF_MARKER = '*** End of File'

class PatchApplicationError extends Error {
  constructor(message, details) {
    super(message)
    this.name = 'PatchApplicationError'
    this.details = details
  }
}

function fail(message, details) {
  throw new PatchApplicationError(message, details)
}

function normalizePatchText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function isTopLevelMarkerLine(line) {
  const trimmed = line.trim()
  return (
    (trimmed.startsWith(ADD_FILE_MARKER) ||
      trimmed.startsWith(DELETE_FILE_MARKER) ||
      trimmed.startsWith(UPDATE_FILE_MARKER) ||
      trimmed === END_PATCH_MARKER ||
      trimmed === EOF_MARKER) &&
    !/^[ \t]/.test(line)
  )
}

function isPatchBoundary(line) {
  const trimmed = line.trim()
  return trimmed === BEGIN_PATCH_MARKER || trimmed === END_PATCH_MARKER
}

function ensureWorkspacePath(rawPath, kind, cwd) {
  const trimmedPath = rawPath.trim()
  if (trimmedPath.length === 0) {
    fail(`${kind} path must not be empty.`)
  }

  const resolvedPath = path.resolve(cwd, trimmedPath)
  const relativePath = path.relative(cwd, resolvedPath)
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    fail(`${kind} path must stay inside the current working directory.`)
  }

  return relativePath.replace(/\\/g, '/')
}

function splitContent(text) {
  if (text.length === 0) {
    return []
  }

  return text.split('\n')
}

function joinContent(lines, lineEnding) {
  const joined = lines.join('\n')
  return lineEnding === '\n' ? joined : joined.replace(/\n/g, lineEnding)
}

function readLineEnding(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

function effectiveLineCount(lines) {
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.length - 1
  }

  return lines.length
}

function stripCommonLineNumberPrefix(line) {
  const match = line.match(/^\s*\d+\s*(?:\||:)\s?(.*)$/u)
  return match ? match[1] : line
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeUnicode(text) {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
}

function normalizeComparableLine(line, mode) {
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

function linesMatchByMode(actualLine, expectedLine, mode) {
  return normalizeComparableLine(actualLine, mode) === normalizeComparableLine(expectedLine, mode)
}

function tryMatch(lines, needleLines, startIndex, endIndex, mode, eof) {
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

function seekSequence(lines, needleLines, startIndex, endIndex, eof = false) {
  if (needleLines.length === 0) {
    return -1
  }

  const modes = ['exact', 'rstrip', 'trim', 'normalized']
  for (const mode of modes) {
    const found = tryMatch(lines, needleLines, startIndex, endIndex, mode, eof)
    if (found !== -1) {
      return found
    }
  }

  return -1
}

function formatLinePreview(lines, centerIndex, radius) {
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

function compareLines(actualLine, expectedLine) {
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

function collectBlockSearchDiagnostics(lines, needleLines, startIndex, endIndex) {
  const exactMatchLines = []
  const firstContextLineMatchLines = []
  let bestPartialMatchLine = null
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

function parsePatch(patchText) {
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

  const operations = []
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
      const rawPath = trimmed.slice(UPDATE_FILE_MARKER.length)
      const filePath = ensureWorkspacePath(rawPath, 'Update File', process.cwd())
      index += 1

      let movePath = null
      if (index < lines.length - 1) {
        const maybeMove = lines[index].trim()
        if (maybeMove.startsWith(MOVE_TO_MARKER)) {
          fail('apply_patch only supports editing existing files. Move the file with a separate filesystem operation.')
        }
      }

      const hunks = []
      while (index < lines.length - 1) {
        const hunkLine = lines[index]
        const trimmedHunkLine = hunkLine.trim()

        if (trimmedHunkLine.length === 0) {
          index += 1
          continue
        }

        if (
          isTopLevelMarkerLine(hunkLine) ||
          trimmedHunkLine.startsWith(DELETE_FILE_MARKER) ||
          trimmedHunkLine.startsWith(UPDATE_FILE_MARKER) ||
          trimmedHunkLine.startsWith(ADD_FILE_MARKER) ||
          trimmedHunkLine === END_PATCH_MARKER
        ) {
          break
        }

        if (!trimmedHunkLine.startsWith('@@')) {
          fail(`Update File hunks must start with '@@'. Got: ${hunkLine}`)
        }

        index += 1
        const hunkLines = []
        let endOfFile = false

        while (index < lines.length - 1) {
          const currentLine = lines[index]
          const currentTrimmed = currentLine.trim()

          if (currentTrimmed === EOF_MARKER) {
            endOfFile = true
            index += 1
            break
          }

          if (currentTrimmed.startsWith('@@') || isTopLevelMarkerLine(currentLine) || currentTrimmed === END_PATCH_MARKER) {
            break
          }

          if (currentLine.length === 0) {
            fail('Patch hunk lines must be prefixed with one of " ", "-", or "+".')
          }

          const prefix = currentLine[0]
          if (prefix !== ' ' && prefix !== '-' && prefix !== '+') {
            fail(`Patch hunk lines must start with a diff prefix. Got: ${currentLine}`)
          }

          hunkLines.push(currentLine)
          index += 1
        }

        hunks.push({ endOfFile, lines: hunkLines })
      }

      if (hunks.length === 0) {
        fail(`Update File for ${filePath} must include at least one hunk.`)
      }

      operations.push({ kind: 'update', movePath, path: filePath, hunks })
      continue
    }

    fail(`Unexpected patch line: ${line}`)
  }

  if (operations.length === 0) {
    fail('apply_patch requires at least one file operation.')
  }

  return operations
}

function hunkToReplacement(hunk) {
  const oldLines = []
  const newLines = []

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

  return { oldLines, newLines, endOfFile: hunk.endOfFile }
}

function findUniqueBlock(haystackLines, needleLines, startIndex = 0, endIndex = haystackLines.length, filePath = '.', resolvedPath = null, eof = false) {
  if (needleLines.length === 0) {
    fail('Cannot search for an empty block.')
  }

  const matchIndex = seekSequence(haystackLines, needleLines, startIndex, endIndex, eof)
  return matchIndex === -1 ? null : matchIndex
}

async function readExistingContent(filePath) {
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
    if (error?.code === 'ENOENT') {
      return {
        exists: false,
        content: '',
      }
    }

    throw error
  }
}

async function readVirtualContent(filePath, cwd, virtualContents) {
  if (virtualContents.has(filePath)) {
    const content = virtualContents.get(filePath)
    return content === null ? { content: null, exists: false } : { content, exists: true }
  }

  const existing = await readExistingContent(path.resolve(cwd, filePath))
  const content = existing.exists ? existing.content : null
  virtualContents.set(filePath, content)
  return { content, exists: existing.exists }
}

async function applyAddFile(operation, cwd, virtualContents) {
  const targetPath = path.resolve(cwd, operation.path)
  const existing = await readVirtualContent(operation.path, cwd, virtualContents)

  virtualContents.set(operation.path, operation.contents)

  return {
    change: {
      fileName: operation.path,
      kind: existing.exists ? 'update' : 'add',
      newContent: operation.contents,
      oldContent: existing.content,
    },
    commit: async () => {
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      const content = joinContent(splitContent(operation.contents), '\n')
      await fs.writeFile(targetPath, content, 'utf8')
    },
  }
}

async function applyDeleteFile(operation, cwd, virtualContents) {
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
    },
    commit: async () => {
      await fs.unlink(targetPath)
    },
  }
}

async function applyUpdateFile(operation, cwd, virtualContents) {
  const sourcePath = path.resolve(cwd, operation.path)
  const existing = await readVirtualContent(operation.path, cwd, virtualContents)

  if (!existing.exists || existing.content === null) {
    fail(`Cannot update missing file: ${operation.path}`)
  }

  const lineEnding = readLineEnding(existing.content)
  let contentLines = splitContent(existing.content.replace(/\r\n/g, '\n'))
  let searchStart = 0
  let mustRemoveTrailingNewline = false

  for (const hunk of operation.hunks) {
    const logicalLength = effectiveLineCount(contentLines)
    let { oldLines, newLines, endOfFile } = hunkToReplacement(hunk)
    let matchIndex = findUniqueBlock(contentLines, oldLines, searchStart, logicalLength, operation.path, sourcePath, endOfFile)

    if (matchIndex === null && oldLines.length > 0 && oldLines.at(-1) === '') {
      oldLines = oldLines.slice(0, -1)
      if (newLines.length > 0 && newLines.at(-1) === '') {
        newLines = newLines.slice(0, -1)
      }
      matchIndex = findUniqueBlock(contentLines, oldLines, searchStart, logicalLength, operation.path, sourcePath, endOfFile)
    }

    if (matchIndex === null) {
      fail(`Could not find the hunk context in ${operation.path}. Add more surrounding lines.`, {
        ...collectBlockSearchDiagnostics(contentLines, oldLines, searchStart, logicalLength),
        filePath: operation.path,
        resolvedPath: sourcePath,
      })
    }

    contentLines = [
      ...contentLines.slice(0, matchIndex),
      ...newLines,
      ...contentLines.slice(matchIndex + oldLines.length),
    ]
    searchStart = matchIndex + newLines.length
    mustRemoveTrailingNewline ||= endOfFile
  }

  let nextContent = joinContent(contentLines, lineEnding)
  if (mustRemoveTrailingNewline) {
    if (nextContent.endsWith(lineEnding)) {
      nextContent = nextContent.slice(0, -lineEnding.length)
    }
  }

  const destinationPath = operation.movePath ? path.resolve(cwd, operation.movePath) : sourcePath
  virtualContents.set(operation.path, null)
  virtualContents.set(operation.movePath ?? operation.path, nextContent)

  return {
    change: {
      fileName: operation.movePath ?? operation.path,
      kind: 'update',
      newContent: nextContent,
      oldContent: existing.content,
      sourcePath: operation.movePath ? operation.path : null,
    },
    commit: async () => {
      if (destinationPath !== sourcePath) {
        await fs.mkdir(path.dirname(destinationPath), { recursive: true })
        await fs.writeFile(destinationPath, nextContent, 'utf8')
        await fs.unlink(sourcePath)
        return
      }

      await fs.writeFile(sourcePath, nextContent, 'utf8')
    },
  }
}

export async function applyPatchText(patchText, cwd = process.cwd()) {
  const operations = parsePatch(patchText)
  const changedPaths = []
  const plannedOperations = []
  const virtualContents = new Map()

  for (const operation of operations) {
    if (operation.kind === 'add') {
      const planned = await applyAddFile(operation, cwd, virtualContents)
      plannedOperations.push(planned)
      changedPaths.push(planned.change.fileName)
      continue
    }

    if (operation.kind === 'delete') {
      const planned = await applyDeleteFile(operation, cwd, virtualContents)
      plannedOperations.push(planned)
      changedPaths.push(planned.change.fileName)
      continue
    }

    const planned = await applyUpdateFile(operation, cwd, virtualContents)
    plannedOperations.push(planned)
    changedPaths.push(planned.change.fileName)
  }

  for (const planned of plannedOperations) {
    await planned.commit()
  }

  return changedPaths
}

async function readPatchTextFromStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }

  return chunks.join('')
}

async function main() {
  const argText = process.argv.slice(2).join(' ')
  const patchText = argText.length > 0 ? argText : await readPatchTextFromStdin()
  const changedPaths = await applyPatchText(patchText, process.cwd())
  const displayPaths = changedPaths.map((filePath) => path.relative(process.cwd(), filePath) || '.')
  console.log(`Applied patch successfully to ${displayPaths.length} path${displayPaths.length === 1 ? '' : 's'}.`)
  for (const displayPath of displayPaths) {
    console.log(`- ${displayPath}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`apply_patch failed: ${message}`)
    const details = error && typeof error === 'object' ? error.details : null
    if (details && typeof details === 'object') {
      for (const [key, value] of Object.entries(details)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          console.error(`${key}: ${value}`)
        }
      }
    }
    process.exitCode = 1
  })
}
