import { useEffect, useState } from 'react'
import type { WorkspaceRefactorCandidate } from '../types/chat'

interface UseWorkspaceRefactorCandidatesResult {
  candidates: WorkspaceRefactorCandidate[]
  isLoading: boolean
}

export function useWorkspaceRefactorCandidates(workspaceRootPath: string | null | undefined): UseWorkspaceRefactorCandidatesResult {
  const [candidates, setCandidates] = useState<WorkspaceRefactorCandidate[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const normalizedWorkspaceRootPath = workspaceRootPath?.trim() ?? ''
    if (normalizedWorkspaceRootPath.length === 0) {
      setCandidates([])
      setIsLoading(false)
      return
    }

    let isCancelled = false
    setCandidates([])
    setIsLoading(true)

    void window.echosphereWorkspace
      .listRefactorCandidates({
        workspaceRootPath: normalizedWorkspaceRootPath,
      })
      .then((nextCandidates) => {
        if (isCancelled) {
          return
        }

        setCandidates(nextCandidates)
        setIsLoading(false)
      })
      .catch((error) => {
        if (isCancelled) {
          return
        }

        console.error('Failed to load workspace refactor candidates', error)
        setCandidates([])
        setIsLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [workspaceRootPath])

  return {
    candidates,
    isLoading,
  }
}
