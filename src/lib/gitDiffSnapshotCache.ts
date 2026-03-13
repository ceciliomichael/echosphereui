import { buildFileDiffSnapshot, type ConversationDiffSnapshot } from './chatDiffs'
import { normalizeGitWorkspacePath } from './gitBranchStateCache'

const EMPTY_DIFF_SNAPSHOT: ConversationDiffSnapshot = {
  fileDiffs: [],
  totalAddedLineCount: 0,
  totalRemovedLineCount: 0,
}

const diffSnapshotCache = new Map<string, ConversationDiffSnapshot>()
const inFlightDiffSnapshotRequests = new Map<string, Promise<ConversationDiffSnapshot>>()

export function getEmptyGitDiffSnapshot() {
  return EMPTY_DIFF_SNAPSHOT
}

export function getCachedGitDiffSnapshot(workspacePath: string | null | undefined) {
  const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
  if (!normalizedWorkspacePath) {
    return null
  }

  return diffSnapshotCache.get(normalizedWorkspacePath) ?? null
}

export async function loadGitDiffSnapshot(
  workspacePath: string | null | undefined,
  options?: { forceRefresh?: boolean },
) {
  const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
  if (!normalizedWorkspacePath) {
    return EMPTY_DIFF_SNAPSHOT
  }

  if (!options?.forceRefresh) {
    const cachedDiffSnapshot = diffSnapshotCache.get(normalizedWorkspacePath)
    if (cachedDiffSnapshot) {
      return cachedDiffSnapshot
    }
  }

  const existingRequest = inFlightDiffSnapshotRequests.get(normalizedWorkspacePath)
  if (existingRequest && !options?.forceRefresh) {
    return existingRequest
  }

  const nextRequest = window.echosphereGit
    .getDiffs(normalizedWorkspacePath)
    .then((diffSnapshot) => {
      const normalizedSnapshot = diffSnapshot.hasRepository
        ? buildFileDiffSnapshot(diffSnapshot.fileDiffs)
        : EMPTY_DIFF_SNAPSHOT
      diffSnapshotCache.set(normalizedWorkspacePath, normalizedSnapshot)
      return normalizedSnapshot
    })
    .finally(() => {
      if (inFlightDiffSnapshotRequests.get(normalizedWorkspacePath) === nextRequest) {
        inFlightDiffSnapshotRequests.delete(normalizedWorkspacePath)
      }
    })

  inFlightDiffSnapshotRequests.set(normalizedWorkspacePath, nextRequest)
  return nextRequest
}

export async function prefetchGitDiffSnapshots(workspacePaths: readonly (string | null | undefined)[]) {
  const uniqueWorkspacePaths = Array.from(
    new Set(workspacePaths.map((workspacePath) => normalizeGitWorkspacePath(workspacePath)).filter(Boolean)),
  )

  await Promise.allSettled(uniqueWorkspacePaths.map((workspacePath) => loadGitDiffSnapshot(workspacePath)))
}
