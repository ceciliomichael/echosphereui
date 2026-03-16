import { buildFileDiffSnapshot, type ConversationDiffSnapshot } from './chatDiffs'
import { normalizeGitWorkspacePath } from './gitBranchStateCache'

const EMPTY_DIFF_SNAPSHOT: ConversationDiffSnapshot = {
  fileDiffs: [],
  totalAddedLineCount: 0,
  totalRemovedLineCount: 0,
}
const MAX_DIFF_SNAPSHOT_CACHE_ENTRIES = 12

const diffSnapshotCache = new Map<string, ConversationDiffSnapshot>()
const inFlightDiffSnapshotRequests = new Map<string, Promise<ConversationDiffSnapshot>>()

function setCachedDiffSnapshot(cacheKey: string, snapshot: ConversationDiffSnapshot) {
  if (diffSnapshotCache.has(cacheKey)) {
    diffSnapshotCache.delete(cacheKey)
  }

  diffSnapshotCache.set(cacheKey, snapshot)
  while (diffSnapshotCache.size > MAX_DIFF_SNAPSHOT_CACHE_ENTRIES) {
    const oldestKey = diffSnapshotCache.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }

    diffSnapshotCache.delete(oldestKey)
  }
}

export function getEmptyGitDiffSnapshot() {
  return EMPTY_DIFF_SNAPSHOT
}

export function getCachedGitDiffSnapshot(workspacePath: string | null | undefined) {
  const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
  if (!normalizedWorkspacePath) {
    return null
  }

  const cachedSnapshot = diffSnapshotCache.get(normalizedWorkspacePath)
  if (!cachedSnapshot) {
    return null
  }

  // Keep most recently accessed entries alive while older snapshots are evicted.
  setCachedDiffSnapshot(normalizedWorkspacePath, cachedSnapshot)
  return cachedSnapshot
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
      setCachedDiffSnapshot(normalizedWorkspacePath, normalizedSnapshot)
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
