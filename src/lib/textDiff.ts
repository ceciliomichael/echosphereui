export interface DiffLine {
  collapsedCount?: number
  content: string
  lineNumber: number | null
  newLineNumber?: number
  oldLineNumber?: number
  type: 'added' | 'collapsed' | 'removed' | 'unchanged'
}

export interface DiffSummary {
  addedLineCount: number
  removedLineCount: number
}

interface ComputeDiffOptions {
  isStreaming?: boolean
  startLineNumber?: number
}

const DIFF_LOOKAHEAD_LIMIT = 48

export function normalizeEscapedSequences(content: string) {
  if (!content) {
    return content
  }

  const hasActualNewlines = content.includes('\n')
  const hasEscapedSequences = /\\[ntr]/.test(content)

  if (!hasActualNewlines && hasEscapedSequences) {
    return content.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  }

  return content
}

export function computeDiffLines(
  oldContent: string | null | undefined,
  newContent: string,
  { isStreaming = false, startLineNumber = 1 }: ComputeDiffOptions = {},
) {
  const normalizedNewContent = normalizeEscapedSequences(newContent)
  const normalizedOldContent = oldContent ? normalizeEscapedSequences(oldContent) : oldContent

  if (normalizedOldContent === null || normalizedOldContent === undefined) {
    return normalizedNewContent.split('\n').map((line, index) => ({
      content: line,
      lineNumber: index + startLineNumber,
      newLineNumber: index + startLineNumber,
      oldLineNumber: undefined,
      type: 'added' as const,
    }))
  }

  const oldLines = normalizedOldContent.split('\n')
  const newLines = normalizedNewContent.split('\n')
  const diff: DiffLine[] = []
  const maxOldIndex = oldLines.length - 1
  const maxNewIndex = newLines.length - 1

  function findLookaheadIndex(lines: string[], startIndex: number, targetLine: string) {
    const endIndex = Math.min(lines.length, startIndex + DIFF_LOOKAHEAD_LIMIT)
    for (let index = startIndex; index < endIndex; index += 1) {
      if (lines[index] === targetLine) {
        return index - startIndex
      }
    }

    return -1
  }

  let oldIndex = 0
  let newIndex = 0

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex]
    const newLine = newLines[newIndex]

    if (oldIndex >= oldLines.length) {
      diff.push({
        content: newLine,
        lineNumber: newIndex + startLineNumber,
        newLineNumber: newIndex + startLineNumber,
        oldLineNumber: undefined,
        type: 'added',
      })
      newIndex += 1
      continue
    }

    if (newIndex >= newLines.length) {
      if (!isStreaming) {
        diff.push({
          content: oldLine,
          lineNumber: oldIndex + startLineNumber,
          newLineNumber: undefined,
          oldLineNumber: oldIndex + startLineNumber,
          type: 'removed',
        })
      }
      oldIndex += 1
      continue
    }

    if (oldLine === newLine) {
      diff.push({
        content: oldLine,
        lineNumber: oldIndex + startLineNumber,
        newLineNumber: newIndex + startLineNumber,
        oldLineNumber: oldIndex + startLineNumber,
        type: 'unchanged',
      })
      oldIndex += 1
      newIndex += 1
      continue
    }

    const foundInOld = oldIndex < maxOldIndex ? findLookaheadIndex(oldLines, oldIndex + 1, newLine) : -1
    const foundInNew = newIndex < maxNewIndex ? findLookaheadIndex(newLines, newIndex + 1, oldLine) : -1

    if (foundInOld !== -1 && (foundInNew === -1 || foundInOld <= foundInNew)) {
      diff.push({
        content: oldLine,
        lineNumber: oldIndex + startLineNumber,
        newLineNumber: undefined,
        oldLineNumber: oldIndex + startLineNumber,
        type: 'removed',
      })
      oldIndex += 1
      continue
    }

    if (foundInNew !== -1) {
      diff.push({
        content: newLine,
        lineNumber: newIndex + startLineNumber,
        newLineNumber: newIndex + startLineNumber,
        oldLineNumber: undefined,
        type: 'added',
      })
      newIndex += 1
      continue
    }

    diff.push({
      content: oldLine,
      lineNumber: oldIndex + startLineNumber,
      newLineNumber: undefined,
      oldLineNumber: oldIndex + startLineNumber,
      type: 'removed',
    })
    diff.push({
      content: newLine,
      lineNumber: newIndex + startLineNumber,
      newLineNumber: newIndex + startLineNumber,
      oldLineNumber: undefined,
      type: 'added',
    })
    oldIndex += 1
    newIndex += 1
  }

  return diff
}

export function summarizeDiffLines(diffLines: DiffLine[]): DiffSummary {
  let addedLineCount = 0
  let removedLineCount = 0

  for (const line of diffLines) {
    if (line.type === 'added') {
      addedLineCount += 1
      continue
    }

    if (line.type === 'removed') {
      removedLineCount += 1
    }
  }

  return {
    addedLineCount,
    removedLineCount,
  }
}

export function getDiffSummary(
  oldContent: string | null | undefined,
  newContent: string,
  options?: ComputeDiffOptions,
) {
  return summarizeDiffLines(computeDiffLines(oldContent, newContent, options))
}
