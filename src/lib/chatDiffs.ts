import { getDiffSummary } from './textDiff'
import type { FileDiffToolResultPresentation, Message } from '../types/chat'

export interface ConversationFileDiff {
  addedLineCount: number
  contextLines?: number
  fileName: string
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
    newContent: result.newContent,
    oldContent: result.oldContent,
    removedLineCount: result.removedLineCount ?? computedSummary.removedLineCount,
    ...(result.contextLines === undefined ? {} : { contextLines: result.contextLines }),
    ...(result.startLineNumber === undefined ? {} : { startLineNumber: result.startLineNumber }),
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

  const fileDiffs = Array.from(latestDiffByFile.values()).sort((left, right) =>
    left.fileName.localeCompare(right.fileName, undefined, { sensitivity: 'base' }),
  )

  let totalAddedLineCount = 0
  let totalRemovedLineCount = 0

  for (const diff of fileDiffs) {
    totalAddedLineCount += diff.addedLineCount
    totalRemovedLineCount += diff.removedLineCount
  }

  return {
    fileDiffs,
    totalAddedLineCount,
    totalRemovedLineCount,
  }
}
