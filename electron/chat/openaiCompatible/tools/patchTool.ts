import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseToolArguments, readRequiredText, resolveToolPath, toDisplayPath } from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'
import { captureWorkspaceCheckpointFileState } from '../../../workspace/checkpoints'

const BEGIN_PATCH_MARKER = '*** Begin Patch'
const END_PATCH_MARKER = '*** End Patch'
const ADD_FILE_MARKER = '*** Add File: '
const DELETE_FILE_MARKER = '*** Delete File: '
const UPDATE_FILE_MARKER = '*** Update File: '
const MOVE_TO_MARKER = '*** Move to: '
const EOF_MARKER = '*** End of File'

interface UpdateChunk {
  changeContext?: string
  isEndOfFile: boolean
  newLines: string[]
  oldLines: string[]
}

type ParsedHunk =
  | { contents: string; kind: 'add'; rawPath: string }
  | { kind: 'delete'; rawPath: string }
  | { chunks: UpdateChunk[]; kind: 'update'; moveToRawPath?: string; rawPath: string }

type PlannedChange =
  | { content: string; kind: 'add'; path: string; relativePath: string }
  | { contentBefore: string; kind: 'delete'; path: string; relativePath: string }
  | {
      content: string
      contentBefore: string
      kind: 'update'
      moveToPath?: string
      moveToRelativePath?: string
      path: string
      relativePath: string
    }

interface PrimaryDiffPayload {
  newContent: string
  oldContent: string | null
  path: string
}

function normalizeLineEndings(input: string) {
  return input.replace(/\r\n/g, '\n')
}

function maybeUnwrapHeredocPatch(input: string) {
  const normalized = normalizeLineEndings(input).trim()
  const lines = normalized.split('\n')
  if (lines.length < 4) {
    return normalized
  }

  const firstLine = lines[0]?.trim()
  const lastLine = lines[lines.length - 1]?.trim()
  const isHeredocStart = firstLine === '<<EOF' || firstLine === "<<'EOF'" || firstLine === '<<"EOF"'
  if (!isHeredocStart || !lastLine?.endsWith('EOF')) {
    return normalized
  }

  return lines.slice(1, -1).join('\n').trim()
}

function splitContentLines(content: string) {
  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function joinContentLines(lines: string[]) {
  return `${lines.join('\n')}\n`
}

function parseUpdateChunk(lines: string[], startIndex: number): { chunk: UpdateChunk; nextIndex: number } {
  let cursor = startIndex
  let changeContext: string | undefined

  if (cursor < lines.length) {
    const candidate = lines[cursor].trim()
    if (candidate === '@@' || candidate.startsWith('@@ ')) {
      changeContext = candidate === '@@' ? undefined : candidate.slice(3)
      cursor += 1
    }
  }

  const oldLines: string[] = []
  const newLines: string[] = []
  let isEndOfFile = false

  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.startsWith('*** ')) {
      break
    }
    if ((line.trim() === '@@' || line.trim().startsWith('@@ ')) && oldLines.length + newLines.length > 0) {
      break
    }

    if (line === EOF_MARKER) {
      isEndOfFile = true
      cursor += 1
      break
    }

    if (line.length === 0) {
      throw new OpenAICompatibleToolError('Invalid patch hunk: change line must start with +, -, or space.', {
        lineNumber: cursor + 1,
      })
    }

    const prefix = line[0]
    const text = line.slice(1)
    if (prefix === ' ') {
      oldLines.push(text)
      newLines.push(text)
      cursor += 1
      continue
    }
    if (prefix === '-') {
      oldLines.push(text)
      cursor += 1
      continue
    }
    if (prefix === '+') {
      newLines.push(text)
      cursor += 1
      continue
    }

    throw new OpenAICompatibleToolError('Invalid patch hunk: change line must start with +, -, or space.', {
      lineNumber: cursor + 1,
      receivedLine: line,
    })
  }

  if (oldLines.length === 0 && newLines.length === 0) {
    throw new OpenAICompatibleToolError('Invalid patch hunk: empty update chunk.', {
      lineNumber: startIndex + 1,
    })
  }

  return {
    chunk: {
      ...(changeContext === undefined ? {} : { changeContext }),
      isEndOfFile,
      newLines,
      oldLines,
    },
    nextIndex: cursor,
  }
}

function parsePatch(patchText: string): ParsedHunk[] {
  const normalizedPatch = maybeUnwrapHeredocPatch(patchText)
  const lines = normalizedPatch.split('\n')

  if (lines.length < 2 || lines[0].trim() !== BEGIN_PATCH_MARKER || lines[lines.length - 1].trim() !== END_PATCH_MARKER) {
    throw new OpenAICompatibleToolError('Invalid patch: first line must be *** Begin Patch and last line must be *** End Patch.')
  }

  const hunks: ParsedHunk[] = []
  let index = 1
  const endIndex = lines.length - 1
  while (index < endIndex) {
    const line = lines[index].trim()
    if (line.length === 0) {
      index += 1
      continue
    }

    if (line.startsWith(ADD_FILE_MARKER)) {
      const rawPath = line.slice(ADD_FILE_MARKER.length).trim()
      if (rawPath.length === 0) {
        throw new OpenAICompatibleToolError('Invalid patch: Add File requires a path.', { lineNumber: index + 1 })
      }
      index += 1
      const addLines: string[] = []
      while (index < endIndex) {
        const addLine = lines[index]
        if (!addLine.startsWith('+')) {
          break
        }
        addLines.push(addLine.slice(1))
        index += 1
      }
      if (addLines.length === 0) {
        throw new OpenAICompatibleToolError('Invalid patch: Add File must include one or more + lines.', {
          lineNumber: index + 1,
          path: rawPath,
        })
      }
      hunks.push({ contents: `${addLines.join('\n')}\n`, kind: 'add', rawPath })
      continue
    }

    if (line.startsWith(DELETE_FILE_MARKER)) {
      const rawPath = line.slice(DELETE_FILE_MARKER.length).trim()
      if (rawPath.length === 0) {
        throw new OpenAICompatibleToolError('Invalid patch: Delete File requires a path.', { lineNumber: index + 1 })
      }
      hunks.push({ kind: 'delete', rawPath })
      index += 1
      continue
    }

    if (line.startsWith(UPDATE_FILE_MARKER)) {
      const rawPath = line.slice(UPDATE_FILE_MARKER.length).trim()
      if (rawPath.length === 0) {
        throw new OpenAICompatibleToolError('Invalid patch: Update File requires a path.', { lineNumber: index + 1 })
      }
      index += 1

      let moveToRawPath: string | undefined
      if (index < endIndex && lines[index].trim().startsWith(MOVE_TO_MARKER)) {
        moveToRawPath = lines[index].trim().slice(MOVE_TO_MARKER.length).trim()
        if (!moveToRawPath) {
          throw new OpenAICompatibleToolError('Invalid patch: Move to requires a destination path.', {
            lineNumber: index + 1,
            path: rawPath,
          })
        }
        index += 1
      }

      const chunks: UpdateChunk[] = []
      while (index < endIndex) {
        const candidate = lines[index]
        if (candidate.trim().length === 0) {
          index += 1
          continue
        }
        if (candidate.trim().startsWith('*** ')) {
          break
        }
        const parsedChunk = parseUpdateChunk(lines, index)
        chunks.push(parsedChunk.chunk)
        index = parsedChunk.nextIndex
      }

      if (chunks.length === 0) {
        throw new OpenAICompatibleToolError('Invalid patch: Update File must include at least one change chunk.', {
          path: rawPath,
        })
      }

      hunks.push({
        chunks,
        kind: 'update',
        ...(moveToRawPath === undefined ? {} : { moveToRawPath }),
        rawPath,
      })
      continue
    }

    throw new OpenAICompatibleToolError('Invalid patch: unknown hunk marker.', {
      lineNumber: index + 1,
      marker: line,
    })
  }

  return hunks
}

function resolvePatchPath(rootPath: string, rawPath: string) {
  const absolutePath = path.isAbsolute(rawPath) ? rawPath : path.join(rootPath, rawPath)
  return resolveToolPath(rootPath, absolutePath)
}

function seekSequence(contentLines: string[], pattern: string[], startIndex: number, isEndOfFile: boolean) {
  if (pattern.length === 0) {
    return isEndOfFile ? contentLines.length : startIndex
  }

  if (pattern.length > contentLines.length) {
    return -1
  }

  const safeStart = Math.max(0, startIndex)
  const maxIndex = contentLines.length - pattern.length
  const searchStart = isEndOfFile ? Math.max(safeStart, maxIndex) : safeStart

  for (let index = searchStart; index <= maxIndex; index += 1) {
    let matched = true
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
      if (contentLines[index + patternIndex] !== pattern[patternIndex]) {
        matched = false
        break
      }
    }
    if (matched) {
      return index
    }
  }

  for (let index = searchStart; index <= maxIndex; index += 1) {
    let matched = true
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
      if (contentLines[index + patternIndex].trimEnd() !== pattern[patternIndex].trimEnd()) {
        matched = false
        break
      }
    }
    if (matched) {
      return index
    }
  }

  for (let index = searchStart; index <= maxIndex; index += 1) {
    let matched = true
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
      if (contentLines[index + patternIndex].trim() !== pattern[patternIndex].trim()) {
        matched = false
        break
      }
    }
    if (matched) {
      return index
    }
  }

  const normalizeForFuzzyMatch = (value: string) =>
    value
      .trim()
      .split('')
      .map((character) => {
        if ('‐‑‒–—―−'.includes(character)) {
          return '-'
        }
        if ('‘’‚‛'.includes(character)) {
          return "'"
        }
        if ('“”„‟'.includes(character)) {
          return '"'
        }
        if ('\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000'.includes(character)) {
          return ' '
        }
        return character
      })
      .join('')

  for (let index = searchStart; index <= maxIndex; index += 1) {
    let matched = true
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
      if (normalizeForFuzzyMatch(contentLines[index + patternIndex]) !== normalizeForFuzzyMatch(pattern[patternIndex])) {
        matched = false
        break
      }
    }
    if (matched) {
      return index
    }
  }

  if (isEndOfFile && searchStart !== safeStart) {
    return seekSequence(contentLines, pattern, safeStart, false)
  }

  return -1
}

function deriveUpdatedContent(absolutePath: string, currentContent: string, chunks: UpdateChunk[]) {
  const originalLines = splitContentLines(currentContent)
  const replacements: { newLines: string[]; oldLength: number; startIndex: number }[] = []
  let lineIndex = 0

  for (const chunk of chunks) {
    if (chunk.changeContext !== undefined) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false)
      if (contextIndex < 0) {
        throw new OpenAICompatibleToolError('Failed to find change context while applying patch.', {
          path: absolutePath,
          context: chunk.changeContext,
        })
      }
      lineIndex = contextIndex + 1
    }

    let oldPattern = chunk.oldLines
    let newPattern = chunk.newLines
    let foundIndex = seekSequence(originalLines, oldPattern, lineIndex, chunk.isEndOfFile)
    if (foundIndex < 0 && oldPattern.length > 0 && oldPattern[oldPattern.length - 1] === '') {
      oldPattern = oldPattern.slice(0, -1)
      if (newPattern.length > 0 && newPattern[newPattern.length - 1] === '') {
        newPattern = newPattern.slice(0, -1)
      }
      foundIndex = seekSequence(originalLines, oldPattern, lineIndex, chunk.isEndOfFile)
    }

    if (foundIndex < 0) {
      throw new OpenAICompatibleToolError('Failed to find expected lines while applying patch.', {
        oldLines: chunk.oldLines,
        path: absolutePath,
      })
    }

    replacements.push({
      newLines: newPattern,
      oldLength: oldPattern.length,
      startIndex: foundIndex,
    })
    lineIndex = foundIndex + oldPattern.length
  }

  replacements.sort((lhs, rhs) => lhs.startIndex - rhs.startIndex)
  const nextLines = [...originalLines]
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index]
    nextLines.splice(replacement.startIndex, replacement.oldLength, ...replacement.newLines)
  }

  return joinContentLines(nextLines)
}

async function existsAsFile(absolutePath: string) {
  try {
    const stat = await fs.stat(absolutePath)
    return stat.isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function readRequiredFile(absolutePath: string, action: 'delete' | 'update') {
  try {
    return await fs.readFile(absolutePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new OpenAICompatibleToolError(`Cannot ${action} file because it does not exist.`, {
        absolutePath,
      })
    }
    if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
      throw new OpenAICompatibleToolError(`Cannot ${action} path because it is a directory.`, {
        absolutePath,
      })
    }
    throw error
  }
}

export const patchTool: OpenAICompatibleToolDefinition = {
  executionMode: 'path-exclusive',
  name: 'patch',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const patch = readRequiredText(argumentsValue, 'patch')
    const hunks = parsePatch(patch)
    const rootPath = path.resolve(context.agentContextRootPath)

    const plannedChanges: PlannedChange[] = []
    for (const hunk of hunks) {
      if (hunk.kind === 'add') {
        const target = resolvePatchPath(rootPath, hunk.rawPath)
        if (await existsAsFile(target.normalizedTargetPath)) {
          throw new OpenAICompatibleToolError('Cannot add file because it already exists.', {
            absolutePath: target.normalizedTargetPath,
          })
        }
        plannedChanges.push({
          content: hunk.contents,
          kind: 'add',
          path: target.normalizedTargetPath,
          relativePath: target.relativePath,
        })
        continue
      }

      if (hunk.kind === 'delete') {
        const target = resolvePatchPath(rootPath, hunk.rawPath)
        const contentBefore = await readRequiredFile(target.normalizedTargetPath, 'delete')
        plannedChanges.push({
          contentBefore,
          kind: 'delete',
          path: target.normalizedTargetPath,
          relativePath: target.relativePath,
        })
        continue
      }

      const source = resolvePatchPath(rootPath, hunk.rawPath)
      const sourceContent = normalizeLineEndings(await readRequiredFile(source.normalizedTargetPath, 'update'))
      const updatedContent = deriveUpdatedContent(source.normalizedTargetPath, sourceContent, hunk.chunks)
      let moveToPath: string | undefined
      let moveToRelativePath: string | undefined
      if (hunk.moveToRawPath !== undefined) {
        const destination = resolvePatchPath(rootPath, hunk.moveToRawPath)
        moveToPath = destination.normalizedTargetPath
        moveToRelativePath = destination.relativePath
      }

      plannedChanges.push({
        content: updatedContent,
        contentBefore: sourceContent,
        kind: 'update',
        ...(moveToPath === undefined ? {} : { moveToPath }),
        ...(moveToRelativePath === undefined ? {} : { moveToRelativePath }),
        path: source.normalizedTargetPath,
        relativePath: source.relativePath,
      })
    }

    const addedPaths: string[] = []
    const modifiedPaths: string[] = []
    const deletedPaths: string[] = []
    let contentChanged = false
    let primaryDiffPayload: PrimaryDiffPayload | null = null

    for (const change of plannedChanges) {
      if (change.kind === 'add') {
        if (context.workspaceCheckpointId) {
          await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, change.path)
        }
        await fs.mkdir(path.dirname(change.path), { recursive: true })
        await fs.writeFile(change.path, change.content, 'utf8')
        const displayPath = toDisplayPath(change.relativePath)
        addedPaths.push(displayPath)
        if (plannedChanges.length === 1) {
          primaryDiffPayload = {
            newContent: change.content,
            oldContent: null,
            path: displayPath,
          }
        }
        contentChanged = true
        continue
      }

      if (change.kind === 'delete') {
        if (context.workspaceCheckpointId) {
          await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, change.path)
        }
        await fs.unlink(change.path)
        deletedPaths.push(toDisplayPath(change.relativePath))
        contentChanged = true
        continue
      }

      if (context.workspaceCheckpointId) {
        await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, change.path)
      }

      const destinationPath = change.moveToPath ?? change.path
      if (destinationPath !== change.path) {
        if (context.workspaceCheckpointId && (await existsAsFile(destinationPath))) {
          await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, destinationPath)
        }
        await fs.mkdir(path.dirname(destinationPath), { recursive: true })
      }

      const hasEffectiveChange = change.contentBefore !== change.content || destinationPath !== change.path
      if (destinationPath === change.path) {
        await fs.writeFile(destinationPath, change.content, 'utf8')
        modifiedPaths.push(toDisplayPath(change.relativePath))
      } else {
        await fs.writeFile(destinationPath, change.content, 'utf8')
        await fs.unlink(change.path)
        modifiedPaths.push(toDisplayPath(change.moveToRelativePath ?? change.relativePath))
      }

      if (hasEffectiveChange) {
        contentChanged = true
      }

      if (plannedChanges.length === 1) {
        const displayPath = toDisplayPath(change.moveToRelativePath ?? change.relativePath)
        primaryDiffPayload = {
          newContent: change.content,
          oldContent: change.contentBefore,
          path: displayPath,
        }
      }
    }

    const operation = contentChanged ? 'apply_patch' : 'noop'
    const totalChangedPathCount = addedPaths.length + modifiedPaths.length + deletedPaths.length
    const singleChangedPath =
      totalChangedPathCount === 1
        ? (addedPaths[0] ?? modifiedPaths[0] ?? deletedPaths[0] ?? null)
        : null
    const singlePlannedPath =
      plannedChanges.length === 1
        ? (() => {
            const firstChange = plannedChanges[0]
            if (firstChange.kind === 'update') {
              return toDisplayPath(firstChange.moveToRelativePath ?? firstChange.relativePath)
            }

            return toDisplayPath(firstChange.relativePath)
          })()
        : null
    const resolvedSinglePath = singleChangedPath ?? singlePlannedPath
    const message =
      operation === 'noop'
        ? 'Patch produced no file changes.'
        : resolvedSinglePath
          ? `Edited ${resolvedSinglePath} successfully.`
          : `Applied patch successfully (${plannedChanges.length} file change${plannedChanges.length === 1 ? '' : 's'}).`

    return {
      addedPaths,
      changeCount: plannedChanges.length,
      contentChanged,
      deletedPaths,
      endLineNumber: undefined,
      message,
      modifiedPaths,
      ...(primaryDiffPayload
        ? {
            newContent: primaryDiffPayload.newContent,
            oldContent: primaryDiffPayload.oldContent,
          }
        : {}),
      ok: true,
      operation,
      path: resolvedSinglePath ?? '.',
      startLineNumber: undefined,
      targetKind: 'workspace',
    }
  },
  tool: {
    function: {
      description: 'Apply a structured patch with add, update, delete, and move operations inside the locked thread root.',
      name: 'patch',
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            description:
              'Patch text using the patch format with *** Begin Patch / *** End Patch markers and Add/Update/Delete File hunks.',
            type: 'string',
          },
        },
        required: ['patch'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
