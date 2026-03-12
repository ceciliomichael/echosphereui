import { useCallback, useEffect, useState } from 'react'
import type { GitBranchState } from '../types/chat'
import {
  getCachedGitBranchState,
  getEmptyGitBranchState,
  loadGitBranchState,
  normalizeGitWorkspacePath,
  storeCachedGitBranchState,
} from '../lib/gitBranchStateCache'

const EMPTY_BRANCH_STATE: GitBranchState = getEmptyGitBranchState()

interface UseGitBranchStateResult {
  branchState: GitBranchState
  changeBranch: (branchName: string) => Promise<void>
  createBranch: (branchName: string) => Promise<void>
  errorMessage: string | null
  isLoading: boolean
  refresh: () => Promise<void>
  isSwitching: boolean
}

export function useGitBranchState(workspacePath: string | null | undefined): UseGitBranchStateResult {
  const [branchState, setBranchState] = useState<GitBranchState>(
    () => getCachedGitBranchState(workspacePath) ?? EMPTY_BRANCH_STATE,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)

  const refresh = useCallback(async () => {
    const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
    if (!normalizedWorkspacePath) {
      setBranchState(EMPTY_BRANCH_STATE)
      setErrorMessage(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextBranchState = await loadGitBranchState(normalizedWorkspacePath, {
        forceRefresh: true,
      })
      setBranchState(nextBranchState)
    } catch (error) {
      setBranchState(EMPTY_BRANCH_STATE)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load git branches.')
    } finally {
      setIsLoading(false)
    }
  }, [workspacePath])

  useEffect(() => {
    let isCancelled = false

    void (async () => {
      const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
      if (!normalizedWorkspacePath) {
        setBranchState(EMPTY_BRANCH_STATE)
        setErrorMessage(null)
        setIsLoading(false)
        return
      }

      const cachedBranchState = getCachedGitBranchState(normalizedWorkspacePath)
      setBranchState(cachedBranchState ?? EMPTY_BRANCH_STATE)
      setIsLoading(cachedBranchState === null)
      setErrorMessage(null)

      try {
        const nextBranchState = await loadGitBranchState(normalizedWorkspacePath)
        if (!isCancelled) {
          setBranchState(nextBranchState)
        }
      } catch (error) {
        if (!isCancelled) {
          setBranchState(EMPTY_BRANCH_STATE)
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load git branches.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [workspacePath])

  const changeBranch = useCallback(
    async (branchName: string) => {
      const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
      if (!normalizedWorkspacePath) {
        return
      }

      setIsSwitching(true)
      setErrorMessage(null)

      try {
        const nextBranchState = await window.echosphereGit.checkoutBranch({
          branchName,
          workspacePath: normalizedWorkspacePath,
        })
        storeCachedGitBranchState(normalizedWorkspacePath, nextBranchState)
        setBranchState(nextBranchState)
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error('Failed to switch branches.')
        setErrorMessage(nextError.message)
        throw nextError
      } finally {
        setIsSwitching(false)
      }
    },
    [workspacePath],
  )

  const createBranch = useCallback(
    async (branchName: string) => {
      const normalizedWorkspacePath = normalizeGitWorkspacePath(workspacePath)
      if (!normalizedWorkspacePath) {
        return
      }

      setIsSwitching(true)
      setErrorMessage(null)

      try {
        const nextBranchState = await window.echosphereGit.createAndCheckoutBranch({
          branchName,
          workspacePath: normalizedWorkspacePath,
        })
        storeCachedGitBranchState(normalizedWorkspacePath, nextBranchState)
        setBranchState(nextBranchState)
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error('Failed to create branch.')
        setErrorMessage(nextError.message)
        throw nextError
      } finally {
        setIsSwitching(false)
      }
    },
    [workspacePath],
  )

  return {
    branchState,
    changeBranch,
    createBranch,
    errorMessage,
    isLoading,
    refresh,
    isSwitching,
  }
}
