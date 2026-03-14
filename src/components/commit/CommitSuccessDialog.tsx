import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, ExternalLink, X } from 'lucide-react'
import type { GitCommitAction, GitCommitResult } from '../../types/chat'

interface CommitSuccessDialogProps {
  action: GitCommitAction
  result: GitCommitResult
  onClose: () => void
}

function getActionCopy(action: GitCommitAction): { description: string; title: string } {
  if (action === 'commit') {
    return {
      description: 'Your commit was created successfully.',
      title: 'Commit successful',
    }
  }

  if (action === 'commit-and-push') {
    return {
      description: 'Your commit was created and pushed to the remote.',
      title: 'Commit and push successful',
    }
  }

  return {
    description: 'Your commit was pushed and a pull request was created.',
    title: 'Commit and create PR successful',
  }
}

export function CommitSuccessDialog({ action, onClose, result }: CommitSuccessDialogProps) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const copy = getActionCopy(action)
  const shortHash = result.commitHash.slice(0, 8)

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center bg-black/12 px-4"
      style={{ top: 'env(titlebar-area-height, 0px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commit-success-title"
        className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-soft"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="commit-success-title" className="text-lg font-semibold text-foreground">
                {copy.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close success dialog"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-border bg-surface-muted px-4 py-3">
          <p className="text-sm text-foreground">
            Commit <span className="font-medium">{shortHash}</span>
            {result.branchName ? (
              <>
                {' '}
                on <span className="font-medium">{result.branchName}</span>
              </>
            ) : null}
            .
          </p>
        </div>

        {action === 'commit-and-create-pr' ? (
          <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
            {result.prUrl ? (
              <a
                href={result.prUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-[#8771FF] transition-colors hover:text-[#6d5ed6]"
              >
                Open pull request
                <ExternalLink size={14} />
              </a>
            ) : (
              <span>Pull request was created, but no URL was returned.</span>
            )}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-surface-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-[var(--dropdown-option-active-surface)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
