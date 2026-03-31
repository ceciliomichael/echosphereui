import { getDiffSummary } from './textDiff'
import type { FileDiffToolResultPresentation, GitFileDiff, Message } from '../types/chat'

export interface ConversationFileDiff {
  addedLineCount: number
  contextLines?: number
  fileName: string
  isStaged: boolean
  isUnstaged: boolean
  isUntracked: boolean
  isDeleted: boolean
  newContent: string
  oldContent: string | null
  removedLineCount: number
  startLineNumber?: number
}

export interface ConversationDiffSnapshot {
  fileDiffs: ConversationFileDiff[]
  totalAddedLineCount: number
  totalRemovedLineCount: number
}

function normalizeFileDiff(result: FileDiffToolResultPresentation): ConversationFileDiff {
  const computedSummary = getDiffSummary(result.oldContent, result.newContent, {
    ...(result.startLineNumber === undefined ? {} : { startLineNumber: result.startLineNumber }),
  })

  return {
    addedLineCount: result.addedLineCount ?? computedSummary.addedLineCount,
    fileName: result.fileName,
    isStaged: false,
    isUnstaged: false,
    isUntracked: false,
    isDeleted: false,
    newContent: result.newContent,
    oldContent: result.oldContent,
    removedLineCount: result.removedLineCount ?? computedSummary.removedLineCount,
    ...(result.contextLines === undefined ? {} : { contextLines: result.contextLines }),
    ...(result.startLineNumber === undefined ? {} : { startLineNumber: result.startLineNumber }),
  }
}

function normalizeRawFileDiff(result: GitFileDiff): ConversationFileDiff {
  const computedSummary = getDiffSummary(result.oldContent, result.newContent)
  const isDeleted = result.isDeleted ?? (!result.isUntracked && result.oldContent !== null && result.newContent.length === 0)

  return {
    addedLineCount: result.addedLineCount ?? computedSummary.addedLineCount,
    fileName: result.fileName,
    isStaged: result.isStaged,
    isUnstaged: result.isUnstaged,
    isUntracked: result.isUntracked,
    isDeleted,
    newContent: result.newContent,
    oldContent: result.oldContent,
    removedLineCount: result.removedLineCount ?? computedSummary.removedLineCount,
  }
}

export function buildFileDiffSnapshot(fileDiffs: readonly GitFileDiff[]): ConversationDiffSnapshot {
  const normalizedFileDiffs = fileDiffs
    .map((fileDiff) => normalizeRawFileDiff(fileDiff))
    .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { sensitivity: 'base' }))

  let totalAddedLineCount = 0
  let totalRemovedLineCount = 0

  for (const diff of normalizedFileDiffs) {
    totalAddedLineCount += diff.addedLineCount
    totalRemovedLineCount += diff.removedLineCount
  }

  return {
    fileDiffs: normalizedFileDiffs,
    totalAddedLineCount,
    totalRemovedLineCount,
  }
}

export function buildConversationDiffSnapshot(messages: readonly Message[]): ConversationDiffSnapshot {
  const latestDiffByFile = new Map<string, ConversationFileDiff>()

  for (const message of messages) {
    if (!message.toolInvocations || message.toolInvocations.length === 0) {
      continue
    }

    for (const invocation of message.toolInvocations) {
      if (invocation.state !== 'completed' || invocation.resultPresentation?.kind !== 'file_diff') {
        continue
      }

      latestDiffByFile.set(invocation.resultPresentation.fileName, normalizeFileDiff(invocation.resultPresentation))
    }
  }

  return buildFileDiffSnapshot(Array.from(latestDiffByFile.values()))
}
