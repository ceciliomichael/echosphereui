import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspaceKeyboardShortcuts } from './useWorkspaceKeyboardShortcuts'
import type { AppSettings, GitCommitAction, GitCommitResult } from '../types/chat'

export type ChatInterfaceRightPanelTab = 'diff' | 'source-control'

interface CommitSuccessDialogState {
  action: GitCommitAction
  result: GitCommitResult
}

interface UseChatInterfaceControllerInput {
  activeWorkspacePath: string | null
  createConversation: () => Promise<void> | void
  gitBranchState: {
    branchState: {
      currentBranch: string | null
    }
    refresh: () => Promise<void>
  }
  gitCommitState: {
    commit: (input: {
      action: GitCommitAction
      includeUnstaged: boolean
      message: string
      preferredBranchName?: string
    }) => Promise<GitCommitResult>
    refreshStatus: () => Promise<void>
    resetResult: () => void
  }
  hasRepository: boolean
  isActiveScreen: boolean
  isRightPanelOpen: boolean
  messagesLength: number
  onDiffRefresh: (input?: { forceRefresh?: boolean; silent?: boolean }) => Promise<void>
  onRightPanelOpenChange: (nextValue: boolean) => void
  onRightPanelTabChange: (nextTab: ChatInterfaceRightPanelTab) => void
  onUpdateSettings: (input: Partial<AppSettings>) => Promise<AppSettings | null>
  rightPanelTab: ChatInterfaceRightPanelTab
  settings: AppSettings
  activeTerminalWorkspaceKey: string
}

export function useChatInterfaceController(input: UseChatInterfaceControllerInput) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false)
  const [commitSuccessDialog, setCommitSuccessDialog] = useState<CommitSuccessDialogState | null>(null)
  const [pendingFileActionPath, setPendingFileActionPath] = useState<string | null>(null)
  const previousWorkspacePathRef = useRef<string | null>(null)

  const isDiffPanelOpen = input.isRightPanelOpen && input.rightPanelTab === 'diff'
  const isSourceControlPanelOpen = input.isRightPanelOpen && input.rightPanelTab === 'source-control'

  useEffect(() => {
    if (!input.hasRepository && input.isRightPanelOpen) {
      input.onRightPanelOpenChange(false)
    }
  }, [input.hasRepository, input.isRightPanelOpen, input.onRightPanelOpenChange])

  useEffect(() => {
    if (!input.hasRepository) {
      setPendingFileActionPath(null)
    }
  }, [input.hasRepository])

  useEffect(() => {
    if (!input.hasRepository) {
      return
    }

    const normalizedWorkspacePath = input.activeWorkspacePath?.trim() ?? ''
    const workspacePathKey = normalizedWorkspacePath.length > 0 ? normalizedWorkspacePath : null
    const workspaceChanged = previousWorkspacePathRef.current !== workspacePathKey
    previousWorkspacePathRef.current = workspacePathKey

    void input.onDiffRefresh({
      forceRefresh: !workspaceChanged,
      silent: true,
    })
  }, [
    input.activeWorkspacePath,
    input.gitBranchState.branchState.currentBranch,
    input.hasRepository,
    input.messagesLength,
    input.onDiffRefresh,
  ])

  useWorkspaceKeyboardShortcuts({
    enabled: input.isActiveScreen,
    onToggleDiffPanel: () => {
      if (!input.hasRepository) {
        return
      }

      if (isDiffPanelOpen) {
        input.onRightPanelOpenChange(false)
        return
      }

      input.onRightPanelTabChange('diff')
      input.onRightPanelOpenChange(true)
    },
    onToggleSidebar: () => setIsSidebarOpen((currentValue) => !currentValue),
    onCreateConversation: input.createConversation,
  })

  const handleOpenCommitModal = useCallback(() => {
    if (!input.hasRepository) {
      return
    }

    if (input.isRightPanelOpen && input.rightPanelTab === 'source-control') {
      input.onRightPanelOpenChange(false)
    }

    input.gitCommitState.resetResult()
    void input.gitCommitState.refreshStatus()
    setIsCommitModalOpen(true)
  }, [input])

  const handleCloseCommitModal = useCallback(() => {
    setIsCommitModalOpen(false)
  }, [])

  const handleCloseCommitSuccessDialog = useCallback(() => {
    setCommitSuccessDialog(null)
  }, [])

  const handleCommit = useCallback(
    async (commitInput: {
      action: GitCommitAction
      includeUnstaged: boolean
      message: string
      preferredBranchName?: string
    }) => {
      const commitResult = await input.gitCommitState.commit(commitInput)
      setIsCommitModalOpen(false)
      setCommitSuccessDialog({
        action: commitInput.action,
        result: commitResult,
      })

      void input.onDiffRefresh({ forceRefresh: true })
      void input.gitBranchState.refresh()
    },
    [input],
  )

  const handleGitFileAction = useCallback(
    async (filePath: string, action: 'stage' | 'unstage' | 'discard') => {
      const normalizedWorkspacePath = input.activeWorkspacePath?.trim() ?? ''
      if (!input.hasRepository || normalizedWorkspacePath.length === 0) {
        return
      }

      setPendingFileActionPath(filePath)
      try {
        if (action === 'stage') {
          await window.echosphereGit.stageFile({ filePath, workspacePath: normalizedWorkspacePath })
        } else if (action === 'unstage') {
          await window.echosphereGit.unstageFile({ filePath, workspacePath: normalizedWorkspacePath })
        } else {
          await window.echosphereGit.discardFileChanges({ filePath, workspacePath: normalizedWorkspacePath })
        }
        await input.onDiffRefresh({ forceRefresh: true, silent: true })
      } catch (error) {
        console.error(`Failed to ${action} file from git panel`, error)
      } finally {
        setPendingFileActionPath(null)
      }
    },
    [input],
  )

  const handleOpenRightPanelTab = useCallback(
    (tab: ChatInterfaceRightPanelTab) => {
      if (!input.hasRepository) {
        return
      }

      if (input.isRightPanelOpen && input.rightPanelTab === tab) {
        input.onRightPanelOpenChange(false)
        return
      }

      input.onRightPanelTabChange(tab)
      input.onRightPanelOpenChange(true)
    },
    [input],
  )

  const handleRefreshGitUi = useCallback(async () => {
    await Promise.all([input.onDiffRefresh({ forceRefresh: true, silent: true }), input.gitBranchState.refresh()])
  }, [input])

  const handleQuickCommit = useCallback(
    async (commitInput: { includeUnstaged: boolean; message: string }) => {
      await input.gitCommitState.commit({
        action: 'commit',
        includeUnstaged: commitInput.includeUnstaged,
        message: commitInput.message,
      })

      await Promise.all([input.onDiffRefresh({ forceRefresh: true }), input.gitBranchState.refresh(), input.gitCommitState.refreshStatus()])
    },
    [input],
  )

  const handleSourceControlSectionOpenChange = useCallback(
    (sourceControlSectionOpen: AppSettings['sourceControlSectionOpen']) => {
      void input.onUpdateSettings({ sourceControlSectionOpen })
    },
    [input],
  )

  const handleTerminalExecutionModeChange = useCallback(
    (terminalExecutionMode: AppSettings['terminalExecutionMode']) => {
      if (terminalExecutionMode === input.settings.terminalExecutionMode) {
        return
      }

      void input.onUpdateSettings({ terminalExecutionMode })
    },
    [input],
  )

  const setActiveWorkspaceTerminalOpen = useCallback(
    (nextOpen: boolean) => {
      const currentOpenByWorkspace = input.settings.terminalOpenByWorkspace
      const currentOpen = currentOpenByWorkspace[input.activeTerminalWorkspaceKey] ?? false
      if (currentOpen === nextOpen) {
        return
      }

      void input.onUpdateSettings({
        terminalOpenByWorkspace: {
          ...currentOpenByWorkspace,
          [input.activeTerminalWorkspaceKey]: nextOpen,
        },
      })
    },
    [input],
  )

  const handleTerminalPanelHeightCommit = useCallback(
    (nextHeight: number) => {
      const currentHeightsByWorkspace = input.settings.terminalPanelHeightsByWorkspace
      if (currentHeightsByWorkspace[input.activeTerminalWorkspaceKey] === nextHeight) {
        return
      }

      void input.onUpdateSettings({
        terminalPanelHeightsByWorkspace: {
          ...currentHeightsByWorkspace,
          [input.activeTerminalWorkspaceKey]: nextHeight,
        },
      })
    },
    [input],
  )

  return {
    commitSuccessDialog,
    handleCloseCommitModal,
    handleCloseCommitSuccessDialog,
    handleCommit,
    handleDiscardDiffFile: (filePath: string) => handleGitFileAction(filePath, 'discard'),
    handleOpenCommitModal,
    handleOpenRightPanelTab,
    handleQuickCommit,
    handleRefreshGitUi,
    handleSourceControlSectionOpenChange,
    handleStageDiffFile: (filePath: string) => handleGitFileAction(filePath, 'stage'),
    handleTerminalExecutionModeChange,
    handleTerminalPanelHeightCommit,
    handleUnstageDiffFile: (filePath: string) => handleGitFileAction(filePath, 'unstage'),
    isCommitModalOpen,
    isDiffPanelOpen,
    isSidebarOpen,
    isSourceControlPanelOpen,
    pendingFileActionPath,
    setActiveWorkspaceTerminalOpen,
    setIsSidebarOpen,
  }
}
