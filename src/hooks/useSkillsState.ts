import { useEffect, useMemo, useState } from 'react'
import type { SkillsState } from '../types/skills'

interface UseSkillsStateResult {
  errorMessage: string | null
  isLoading: boolean
  state: SkillsState | null
}

function normalizeWorkspacePath(workspacePath?: string | null) {
  const trimmed = workspacePath?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function getSkillsApi() {
  return typeof window !== 'undefined' ? window.echosphereSkills : null
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallbackMessage
}

export function useSkillsState(workspacePath?: string | null): UseSkillsStateResult {
  const normalizedWorkspacePath = useMemo(() => normalizeWorkspacePath(workspacePath), [workspacePath])
  const [state, setState] = useState<SkillsState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const api = getSkillsApi()
    if (!api) {
      setState(null)
      setIsLoading(false)
      setErrorMessage('Skills are unavailable in this renderer.')
      return
    }

    let isActive = true
    setState(null)
    setIsLoading(true)
    setErrorMessage(null)

    void api
      .listSkills(normalizedWorkspacePath)
      .then((nextState) => {
        if (!isActive) {
          return
        }

        setState(nextState)
        setErrorMessage(nextState.errorMessage)
      })
      .catch((error) => {
        if (!isActive) {
          return
        }

        setErrorMessage(getErrorMessage(error, 'Unable to load skills.'))
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [normalizedWorkspacePath])

  return {
    errorMessage,
    isLoading,
    state,
  }
}
