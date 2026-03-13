import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitCommitAction, GitCommitResult, GitStatusResult } from '../types/chat'

interface UseGitCommitInput {
  hasRepository: boolean
  workspacePath: string | null | undefined
}

interface UseGitCommitResult {
  commit: (input: {
    action: GitCommitAction
    includeUnstaged: boolean
    message: string
  }) => Promise<GitCommitResult>
  errorMessage: string | null
  isCommitting: boolean
  isLoadingStatus: boolean
  lastCommitResult: GitCommitResult | null
  refreshStatus: () => Promise<void>
  resetResult: () => void
  status: GitStatusResult | null
}

const EMPTY_STATUS: GitStatusResult = {
  addedLineCount: 0,
  changedFileCount: 0,
  hasRepository: false,
  removedLineCount: 0,
  stagedFileCount: 0,
  unstagedFileCount: 0,
  untrackedFileCount: 0,
}

export function useGitCommit({ hasRepository, workspacePath }: UseGitCommitInput): UseGitCommitResult {
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastCommitResult, setLastCommitResult] = useState<GitCommitResult | null>(null)
  const requestIdRef = useRef(0)

  const refreshStatus = useCallback(async () => {
    const normalizedPath = workspacePath?.trim() ?? ''
    if (normalizedPath.length === 0 || !hasRepository) {
      setStatus(EMPTY_STATUS)
      setIsLoadingStatus(false)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoadingStatus(true)
    setErrorMessage(null)

    try {
      const nextStatus = await window.echosphereGit.getStatus(normalizedPath)
      if (requestId === requestIdRef.current) {
        setStatus(nextStatus)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setStatus(EMPTY_STATUS)
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load git status.')
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoadingStatus(false)
      }
    }
  }, [hasRepository, workspacePath])

  useEffect(() => {
    if (!hasRepository) {
      setStatus(null)
      return
    }

    void refreshStatus()
  }, [hasRepository, refreshStatus])

  const commit = useCallback(async (input: {
    action: GitCommitAction
    includeUnstaged: boolean
    message: string
  }): Promise<GitCommitResult> => {
    const normalizedPath = workspacePath?.trim() ?? ''
    if (normalizedPath.length === 0) {
      throw new Error('Workspace path is required.')
    }

    setIsCommitting(true)
    setErrorMessage(null)

    try {
      const result = await window.echosphereGit.commit({
        action: input.action,
        includeUnstaged: input.includeUnstaged,
        message: input.message,
        workspacePath: normalizedPath,
      })

      setLastCommitResult(result)
      return result
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error('Failed to commit changes.')
      setErrorMessage(nextError.message)
      throw nextError
    } finally {
      setIsCommitting(false)
    }
  }, [workspacePath])

  const resetResult = useCallback(() => {
    setLastCommitResult(null)
    setErrorMessage(null)
  }, [])

  return {
    commit,
    errorMessage,
    isCommitting,
    isLoadingStatus,
    lastCommitResult,
    refreshStatus,
    resetResult,
    status,
  }
}
