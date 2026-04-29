import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { File, Folder, Loader2, Trash2, X } from 'lucide-react'
import type { WorkspaceExplorerDeleteDialogState } from './workspaceExplorerPanelTypes'

interface WorkspaceExplorerDeleteDialogProps {
  isSubmitting: boolean
  onClose: () => void
  onConfirm: () => void
  state: WorkspaceExplorerDeleteDialogState
}

function getDeleteDialogTitle(state: WorkspaceExplorerDeleteDialogState) {
  if (state.targetRelativePaths.length > 1) {
    return `Delete ${state.targetRelativePaths.length} selected items?`
  }

  return state.primaryEntryKind === 'folder'
    ? `Delete folder "${state.primaryEntryName}"?`
    : `Delete file "${state.primaryEntryName}"?`
}

function getDeleteDialogDescription(state: WorkspaceExplorerDeleteDialogState) {
  if (state.targetRelativePaths.length > 1) {
    return 'This will permanently remove the selected items from the workspace.'
  }

  if (state.primaryEntryKind === 'folder') {
    return `This will permanently remove "${state.primaryEntryName}" and everything inside it.`
  }

  return `This will permanently remove "${state.primaryEntryName}" from the workspace.`
}

function getPrimaryIcon(state: WorkspaceExplorerDeleteDialogState) {
  return state.primaryEntryKind === 'folder' ? Folder : File
}

export function WorkspaceExplorerDeleteDialog({ isSubmitting, onClose, onConfirm, state }: WorkspaceExplorerDeleteDialogProps) {
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isSubmitting, onClose])

  const PrimaryIcon = getPrimaryIcon(state)
  const isMultiDelete = state.targetRelativePaths.length > 1

  return createPortal(
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/12 px-4 py-4"
      style={{ top: 'env(titlebar-area-height, 0px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-explorer-delete-dialog-title"
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pt-5 pb-4 md:px-6">
          <div className="min-w-0 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-danger-border bg-danger-surface text-danger-foreground">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0">
              <h2 id="workspace-explorer-delete-dialog-title" className="text-lg font-semibold text-foreground">
                {getDeleteDialogTitle(state)}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{getDeleteDialogDescription(state)}</p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close delete dialog"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 md:px-6">
          {isMultiDelete ? (
            <div className="rounded-2xl border border-border bg-surface px-4 py-4">
              <p className="text-sm font-medium text-foreground">Items to be deleted</p>
              <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                {state.targetRelativePaths.map((relativePath) => (
                  <li
                    key={relativePath}
                    className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-foreground"
                  >
                    {relativePath}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-muted px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-subtle-foreground">
                  <PrimaryIcon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{state.primaryEntryName}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-[0.08em] text-subtle-foreground">
                    {state.primaryEntryKind === 'folder' ? 'Folder' : 'File'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-border-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-danger-border bg-danger-surface px-4 text-sm font-medium text-danger-foreground transition-colors hover:text-danger-foreground-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isSubmitting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
