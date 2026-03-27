import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationDiffSnapshot } from '../lib/chatDiffs'
import {
  getCachedGitDiffSnapshot,
  getEmptyGitDiffSnapshot,
  loadGitDiffSnapshot,
} from '../lib/gitDiffSnapshotCache'

interface UseGitDiffSnapshotInput {
  hasRepository: boolean
  workspacePath: string | null | undefined
}

interface UseGitDiffSnapshotResult {
  errorMessage: string | null
  isLoading: boolean
  refresh: (options?: { forceRefresh?: boolean; silent?: boolean }) => Promise<void>
  snapshot: ConversationDiffSnapshot
}

function areDiffSnapshotsEqual(left: ConversationDiffSnapshot, right: ConversationDiffSnapshot) {
  if (
    left.totalAddedLineCount !== right.totalAddedLineCount ||
    left.totalRemovedLineCount !== right.totalRemovedLineCount ||
    left.fileDiffs.length !== right.fileDiffs.length
  ) {
    return false
  }

  for (let index = 0; index < left.fileDiffs.length; index += 1) {
    const leftFileDiff = left.fileDiffs[index]
    const rightFileDiff = right.fileDiffs[index]
    if (
      leftFileDiff.fileName !== rightFileDiff.fileName ||
      leftFileDiff.addedLineCount !== rightFileDiff.addedLineCount ||
      leftFileDiff.removedLineCount !== rightFileDiff.removedLineCount ||
      leftFileDiff.isStaged !== rightFileDiff.isStaged ||
      leftFileDiff.isUnstaged !== rightFileDiff.isUnstaged ||
      leftFileDiff.isUntracked !== rightFileDiff.isUntracked ||
      leftFileDiff.oldContent !== rightFileDiff.oldContent ||
      leftFileDiff.newContent !== rightFileDiff.newContent
    ) {
      return false
    }
  }

  return true
}

export function useGitDiffSnapshot({ hasRepository, workspacePath }: UseGitDiffSnapshotInput): UseGitDiffSnapshotResult {
  const [snapshot, setSnapshot] = useState<ConversationDiffSnapshot>(
    () => getCachedGitDiffSnapshot(workspacePath) ?? getEmptyGitDiffSnapshot(),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (options?: { forceRefresh?: boolean; silent?: boolean }) => {
    if (!hasRepository) {
      setSnapshot((currentSnapshot) => {
        const emptySnapshot = getEmptyGitDiffSnapshot()
        return areDiffSnapshotsEqual(currentSnapshot, emptySnapshot) ? currentSnapshot : emptySnapshot
      })
      if (!options?.silent) {
        setIsLoading(false)
      }
      setErrorMessage(null)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (!options?.silent) {
      setIsLoading(true)
      setErrorMessage(null)
    }

    try {
      const diffSnapshot = await loadGitDiffSnapshot(workspacePath, {
        forceRefresh: options?.forceRefresh,
      })
      if (requestId !== requestIdRef.current) {
        return
      }

      setSnapshot((currentSnapshot) => (areDiffSnapshotsEqual(currentSnapshot, diffSnapshot) ? currentSnapshot : diffSnapshot))
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return
      }

      setSnapshot((currentSnapshot) => {
        const emptySnapshot = getEmptyGitDiffSnapshot()
        return areDiffSnapshotsEqual(currentSnapshot, emptySnapshot) ? currentSnapshot : emptySnapshot
      })
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load git diffs.')
    } finally {
      if (requestId === requestIdRef.current && !options?.silent) {
        setIsLoading(false)
      }
    }
  }, [hasRepository, workspacePath])

  useEffect(() => {
    const cachedSnapshot = getCachedGitDiffSnapshot(workspacePath) ?? getEmptyGitDiffSnapshot()
    setSnapshot((currentSnapshot) => (areDiffSnapshotsEqual(currentSnapshot, cachedSnapshot) ? currentSnapshot : cachedSnapshot))
    void refresh()
  }, [refresh, workspacePath])

  useEffect(() => {
    if (!hasRepository || !workspacePath) {
      return
    }

    const intervalId = window.setInterval(() => {
      void refresh({ forceRefresh: true, silent: true })
    }, 1500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasRepository, refresh, workspacePath])

  return {
    errorMessage,
    isLoading,
    refresh,
    snapshot,
  }
}

export type GitDiffSnapshotController = ReturnType<typeof useGitDiffSnapshot>
