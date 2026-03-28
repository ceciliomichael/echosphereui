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
      const rawPath = trimmed.slice(ADD_FILE_MARKER.length)
      const filePath = ensureWorkspacePath(rawPath, 'Add File', process.cwd())
      index += 1
      const contents = []

      while (index < lines.length - 1) {
        const bodyLine = lines[index]
        const bodyTrimmed = bodyLine.trim()
        if (isTopLevelMarkerLine(bodyLine) || isPatchBoundary(bodyLine) || bodyTrimmed === EOF_MARKER) {
          break
        }

        if (!bodyLine.startsWith('+')) {
          fail(`Add File lines must start with '+'. Got: ${bodyLine}`)
        }

        contents.push(bodyLine.slice(1))
        index += 1
      }

      if (contents.length === 0) {
        fail(`Add File for ${filePath} must include at least one '+...' line.`)
      }

      operations.push({ kind: 'add', path: filePath, contents: contents.join('\n') })
      continue
    }

    if (trimmed.startsWith(DELETE_FILE_MARKER)) {
      const rawPath = trimmed.slice(DELETE_FILE_MARKER.length)
      const filePath = ensureWorkspacePath(rawPath, 'Delete File', process.cwd())
      operations.push({ kind: 'delete', path: filePath })
      index += 1
      continue
    }

    if (trimmed.startsWith(UPDATE_FILE_MARKER)) {
      const rawPath = trimmed.slice(UPDATE_FILE_MARKER.length)
      const filePath = ensureWorkspacePath(rawPath, 'Update File', process.cwd())
      index += 1

      let movePath = null
      if (index < lines.length - 1) {
        const maybeMove = lines[index].trim()
        if (maybeMove.startsWith(MOVE_TO_MARKER)) {
          movePath = ensureWorkspacePath(maybeMove.slice(MOVE_TO_MARKER.length), 'Move to', process.cwd())
          index += 1
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

function findUniqueBlock(haystackLines, needleLines, startIndex = 0, filePath = '.', resolvedPath = null) {
  if (needleLines.length === 0) {
    fail('Cannot search for an empty block.')
  }

  const matches = []
  for (let index = startIndex; index <= haystackLines.length - needleLines.length; index += 1) {
    let matched = true
    for (let offset = 0; offset < needleLines.length; offset += 1) {
      if (!compareLines(haystackLines[index + offset], needleLines[offset])) {
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
    fail('Found multiple matches for update hunk context. Add more surrounding lines.', {
      ...collectBlockSearchDiagnostics(haystackLines, needleLines, startIndex, haystackLines.length),
      filePath,
      ...(resolvedPath === null ? {} : { resolvedPath }),
    })
  }

  return matches[0]
}

async function applyAddFile(operation, cwd) {
  const targetPath = path.resolve(cwd, operation.path)
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const lineEnding = '\n'
  const content = joinContent(splitContent(operation.contents), lineEnding)
  await fs.writeFile(targetPath, content, 'utf8')
  return targetPath
}

async function applyDeleteFile(operation, cwd) {
  const targetPath = path.resolve(cwd, operation.path)
  const stats = await fs.stat(targetPath).catch((error) => {
    if (error?.code === 'ENOENT') {
      fail(`Cannot delete missing file: ${operation.path}`)
    }
    throw error
  })

  if (!stats.isFile()) {
    fail(`Cannot delete non-file path: ${operation.path}`)
  }

  await fs.unlink(targetPath)
  return targetPath
}

async function applyUpdateFile(operation, cwd) {
  const sourcePath = path.resolve(cwd, operation.path)
  const sourceStats = await fs.stat(sourcePath).catch((error) => {
    if (error?.code === 'ENOENT') {
      fail(`Cannot update missing file: ${operation.path}`)
    }
    throw error
  })

  if (!sourceStats.isFile()) {
    fail(`Cannot update non-file path: ${operation.path}`)
  }

  const originalContent = await fs.readFile(sourcePath, 'utf8')
  const lineEnding = readLineEnding(originalContent)
  let contentLines = splitContent(originalContent.replace(/\r\n/g, '\n'))
  let searchStart = 0
  let mustRemoveTrailingNewline = false

  for (const hunk of operation.hunks) {
    const logicalLength = effectiveLineCount(contentLines)
    const { oldLines, newLines, endOfFile } = hunkToReplacement(hunk)
    const matchIndex = findUniqueBlock(contentLines, oldLines, searchStart, operation.path, sourcePath)

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
  if (operation.movePath) {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.writeFile(destinationPath, nextContent, 'utf8')
    if (destinationPath !== sourcePath) {
      await fs.unlink(sourcePath)
    }
  } else {
    await fs.writeFile(sourcePath, nextContent, 'utf8')
  }

  return destinationPath
}

export async function applyPatchText(patchText, cwd = process.cwd()) {
  const operations = parsePatch(patchText)
  const changedPaths = []

  for (const operation of operations) {
    if (operation.kind === 'add') {
      changedPaths.push(await applyAddFile(operation, cwd))
      continue
    }

    if (operation.kind === 'delete') {
      changedPaths.push(await applyDeleteFile(operation, cwd))
      continue
    }

    changedPaths.push(await applyUpdateFile(operation, cwd))
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
