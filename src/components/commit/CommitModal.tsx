import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, GitBranch, GitCommitHorizontal, ArrowUp, X, Loader2 } from 'lucide-react'
import { FaGithub } from 'react-icons/fa'
import type { GitBranchState, GitCommitAction, GitStatusResult } from '../../types/chat'
import type { ConversationDiffSnapshot } from '../../lib/chatDiffs'
import { Switch } from '../ui/Switch'

type CommitNextStep = GitCommitAction

interface CommitNextStepOption {
  description: string
  icon: React.ReactNode
  label: string
  value: CommitNextStep
}

const COMMIT_NEXT_STEPS: CommitNextStepOption[] = [
  {
    description: 'Create a local commit only',
    icon: <GitCommitHorizontal size={16} />,
    label: 'Commit',
    value: 'commit',
  },
  {
    description: 'Commit and push to remote',
    icon: <ArrowUp size={16} />,
    label: 'Commit and push',
    value: 'commit-and-push',
  },
  {
    description: 'Commit, push, and open PR',
    icon: <FaGithub size={15} />,
    label: 'Commit and create PR',
    value: 'commit-and-create-pr',
  },
]

interface CommitModalProps {
  branchState: GitBranchState
  diffSnapshot: ConversationDiffSnapshot
  errorMessage: string | null
  isCommitting: boolean
  isLoadingStatus: boolean
  isSwitchingBranch: boolean
  onBranchChange: (branchName: string) => void | Promise<void>
  onBranchCreate: (branchName: string) => void | Promise<void>
  onClose: () => void
  onCommit: (input: {
    action: GitCommitAction
    includeUnstaged: boolean
    message: string
  }) => Promise<void>
  status: GitStatusResult | null
}

export function CommitModal({
  branchState,
  diffSnapshot,
  errorMessage,
  isCommitting,
  isLoadingStatus,
  isSwitchingBranch,
  onBranchChange,
  onBranchCreate,
  onClose,
  onCommit,
  status,
}: CommitModalProps) {
  const [commitMessage, setCommitMessage] = useState('')
  const [commitBranchName, setCommitBranchName] = useState('')
  const [includeUnstaged, setIncludeUnstaged] = useState(true)
  const [selectedAction, setSelectedAction] = useState<CommitNextStep>('commit')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isCommitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isCommitting, onClose])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setIsSubmitting(true)
      setLocalError(null)

      try {
        const targetBranch = commitBranchName.trim()
        if (targetBranch && targetBranch !== branchState.currentBranch) {
          if (branchState.branches.includes(targetBranch)) {
            await onBranchChange(targetBranch)
          } else {
            await onBranchCreate(targetBranch)
          }
        }

        await onCommit({
          action: selectedAction,
          includeUnstaged,
          message: commitMessage,
        })
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to commit')
      } finally {
        setIsSubmitting(false)
      }
    },
    [branchState, commitBranchName, commitMessage, includeUnstaged, onBranchChange, onBranchCreate, onCommit, selectedAction],
  )

  const changedFileCount = status?.changedFileCount ?? diffSnapshot.fileDiffs.length
  const addedLineCount = diffSnapshot.totalAddedLineCount
  const removedLineCount = diffSnapshot.totalRemovedLineCount
  const hasChanges = changedFileCount > 0 || addedLineCount > 0 || removedLineCount > 0
  const disableSubmit = isSubmitting || isCommitting || isSwitchingBranch || (!hasChanges && !isLoadingStatus)

  const actionLabel =
    selectedAction === 'commit'
      ? 'Commit'
      : selectedAction === 'commit-and-push'
        ? 'Commit and push'
        : 'Commit, push and create PR'

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center bg-black/12 px-4"
      style={{ top: 'env(titlebar-area-height, 0px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isCommitting) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commit-modal-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-soft"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted">
              <GitCommitHorizontal size={20} className="text-foreground" />
            </div>
            <h2 id="commit-modal-title" className="text-lg font-semibold text-foreground">
              Commit your changes
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close commit dialog"
            disabled={isCommitting}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Branch row */}
          <div className="px-6 py-2.5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-foreground shrink-0 flex flex-col">
                <span>Branch override</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Current: {branchState.currentBranch ?? 'No branch'}
                </span>
              </span>
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">
                  {isSwitchingBranch ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <GitBranch size={14} />
                  )}
                </div>
                <input
                  type="text"
                  value={commitBranchName}
                  onChange={(e) => setCommitBranchName(e.target.value.replace(/[^A-Za-z0-9_.-/]/g, ''))}
                  disabled={disableSubmit}
                  placeholder="Optional (leaving blank uses current)"
                  className="h-10 w-full rounded-xl border border-border bg-surface pl-8 pr-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-0"
                />
              </div>
            </div>
          </div>

          {/* Changes row */}
          <div className="px-6 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Changes</span>
              <div className="flex items-center gap-2">
                {isLoadingStatus ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {changedFileCount} {changedFileCount === 1 ? 'file' : 'files'}
                    </span>
                    {hasChanges ? (
                      <>
                        <span className="text-sm text-emerald-600 dark:text-emerald-400">
                          +{addedLineCount}
                        </span>
                        <span className="text-sm text-red-600 dark:text-red-400">
                          -{removedLineCount}
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Include unstaged toggle */}
          <div className="px-6 py-2.5">
            <label className="flex cursor-pointer items-center gap-3">
              <Switch checked={includeUnstaged} onChange={setIncludeUnstaged} disabled={disableSubmit} />
              <span className="text-sm text-foreground">Include unstaged</span>
            </label>
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-border" />

          {/* Commit message */}
          <div className="px-6 pt-4 pb-2">
            <label htmlFor="commit-message" className="mb-2 block text-sm font-medium text-foreground">
              Commit message
            </label>
            <textarea
              id="commit-message"
              ref={textareaRef}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Leave blank to auto-generate using the active model and staged diff"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-subtle-foreground"
            />
          </div>

          {/* Divider */}
          <div className="mx-6 border-t border-border" />

          {/* Next steps */}
          <div className="px-6 pt-4 pb-2">
            <p className="mb-2 text-sm font-medium text-foreground">Next steps</p>
            <div className="space-y-0.5">
              {COMMIT_NEXT_STEPS.map((step) => {
                const isSelected = step.value === selectedAction
                return (
                  <button
                    key={step.value}
                    type="button"
                    onClick={() => setSelectedAction(step.value)}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      isSelected
                        ? 'bg-surface-muted'
                        : 'hover:bg-surface-muted/60',
                    ].join(' ')}
                  >
                    <span className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      isSelected
                        ? 'bg-[var(--color-action)] text-white'
                        : 'bg-surface-muted text-muted-foreground',
                    ].join(' ')}>
                      {step.icon}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-foreground">{step.label}</span>
                    {isSelected ? (
                      <Check size={16} className="shrink-0 text-foreground" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Error */}
          {errorMessage || localError ? (
            <div className="mx-6 mt-2 rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger-foreground">
              {errorMessage || localError}
            </div>
          ) : null}

          {/* Submit */}
          <div className="px-6 pt-3 pb-5">
            <button
              type="submit"
              disabled={disableSubmit}
              className={[
                'flex h-11 w-full items-center justify-center rounded-xl text-sm font-medium transition-colors',
                disableSubmit
                  ? 'chat-send-button-disabled cursor-not-allowed'
                  : 'chat-send-button-enabled',
              ].join(' ')}
            >
              {isCommitting || isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" />
                  Committing...
                </span>
              ) : (
                actionLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
