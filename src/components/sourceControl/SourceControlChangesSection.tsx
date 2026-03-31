import { ChevronDown } from 'lucide-react'
import type { RefObject } from 'react'
import type { ConversationFileDiff } from '../../lib/chatDiffs'
import { Switch } from '../ui/Switch'
import { SourceControlDiffSection } from './SourceControlDiffSection'

interface SourceControlChangesSectionProps {
  commitActionControlsRef: RefObject<HTMLDivElement>
  commitMessage: string
  expandedChangeFilePaths: readonly string[]
  includeUnstaged: boolean
  isChangesSectionOpen: boolean
  isCommitActionDisabled: boolean
  isCommitActionMenuOpen: boolean
  isCommitPrimaryBusy: boolean
  isQuickCommitting: boolean
  isStagedSectionOpen: boolean
  isUnstagedSectionOpen: boolean
  pendingFileActionPath: string | null
  quickCommitError: string | null
  stagedFileCount: number
  stagedFileDiffs: readonly ConversationFileDiff[]
  syncError: string | null
  syncMessage: string | null
  unstagedFileCount: number
  unstagedFileDiffs: readonly ConversationFileDiff[]
  onCommitActionMenuOpenChange: (nextValue: boolean) => void
  onCommitMessageChange: (nextValue: string) => void
  onDiscardFile: (filePath: string) => Promise<void>
  onExpandedChange: (filePath: string, nextValue: boolean) => void
  onIncludeUnstagedChange: (nextValue: boolean) => void
  onOpenCommitModal: () => void
  onQuickCommitSubmit: (action?: 'commit' | 'commit-and-push') => Promise<void>
  onStageFile: (filePath: string) => Promise<void>
  onStagedSectionOpenChange: (nextValue: boolean) => void
  onToggleChangesSection: () => void
  onUnstageFile: (filePath: string) => Promise<void>
  onUnstagedSectionOpenChange: (nextValue: boolean) => void
}

export function SourceControlChangesSection({
  commitActionControlsRef,
  commitMessage,
  expandedChangeFilePaths,
  includeUnstaged,
  isChangesSectionOpen,
  isCommitActionDisabled,
  isCommitActionMenuOpen,
  isCommitPrimaryBusy,
  isQuickCommitting,
  isStagedSectionOpen,
  isUnstagedSectionOpen,
  pendingFileActionPath,
  quickCommitError,
  stagedFileCount,
  stagedFileDiffs,
  syncError,
  syncMessage,
  unstagedFileCount,
  unstagedFileDiffs,
  onCommitActionMenuOpenChange,
  onCommitMessageChange,
  onDiscardFile,
  onExpandedChange,
  onIncludeUnstagedChange,
  onOpenCommitModal,
  onQuickCommitSubmit,
  onStageFile,
  onStagedSectionOpenChange,
  onToggleChangesSection,
  onUnstageFile,
  onUnstagedSectionOpenChange,
}: SourceControlChangesSectionProps) {
  const sectionBodyClassName = 'min-h-0 flex flex-1 flex-col overflow-hidden'
  const diffViewportClassName = 'min-h-0 flex-1 overflow-y-auto'
  const hasStagedSection = stagedFileDiffs.length > 0
  const shouldShowUnstagedSectionTopBorder = hasStagedSection && isStagedSectionOpen
  const shouldShowUnstagedSectionBottomBorder = isUnstagedSectionOpen || !isStagedSectionOpen

  return (
    <section
      className={[
        isChangesSectionOpen ? 'border-b border-border min-h-0 flex flex-1 flex-col' : 'shrink-0',
      ].join(' ')}
    >
      <button type="button" onClick={onToggleChangesSection} className="flex h-10 w-full items-center justify-between px-4 text-left">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Changes</span>
        <ChevronDown size={13} className={['text-muted-foreground transition-transform', isChangesSectionOpen ? '' : '-rotate-90'].join(' ')} />
      </button>
      <div className={['min-h-0 border-t border-border transition-[opacity] duration-200', isChangesSectionOpen ? 'flex flex-1 flex-col overflow-hidden opacity-100' : 'hidden opacity-0'].join(' ')}>
        <div className="shrink-0 border-b border-border px-4 py-3">
          <textarea
            value={commitMessage}
            onChange={(event) => onCommitMessageChange(event.target.value)}
            rows={3}
            placeholder="Commit message (leave empty to auto-generate with AI)"
            className="w-full resize-none rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle-foreground"
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={includeUnstaged} onChange={onIncludeUnstagedChange} disabled={isQuickCommitting} />
              Include unstaged
            </label>

            <div className="inline-flex items-center gap-1.5">
              <div ref={commitActionControlsRef} className="relative inline-flex items-center">
                <button
                  type="button"
                  disabled={isCommitActionDisabled}
                  onClick={() => void onQuickCommitSubmit('commit')}
                  className={[
                    'inline-flex h-8 min-w-[66px] items-center justify-center rounded-l-lg rounded-r-none pl-2 text-xs font-medium transition-colors',
                    isCommitPrimaryBusy ? 'pr-2' : 'pr-1',
                    isCommitActionDisabled ? 'chat-send-button-disabled cursor-not-allowed' : 'chat-send-button-enabled',
                  ].join(' ')}
                >
                  {isQuickCommitting ? 'Committing' : isCommitPrimaryBusy ? 'Pushing' : 'Commit'}
                </button>
                <button
                  type="button"
                  aria-label="Commit actions"
                  aria-haspopup="menu"
                  aria-expanded={isCommitActionMenuOpen}
                  disabled={isCommitActionDisabled}
                  onClick={() => {
                    onCommitActionMenuOpenChange(!isCommitActionMenuOpen)
                  }}
                  className={[
                    'inline-flex h-8 w-8 items-center justify-center rounded-l-none rounded-r-lg border-l border-white/15 text-xs transition-colors',
                    isCommitActionDisabled ? 'chat-send-button-disabled cursor-not-allowed' : 'chat-send-button-enabled',
                  ].join(' ')}
                >
                  <ChevronDown size={13} />
                </button>
                {isCommitActionMenuOpen ? (
                  <div
                    role="menu"
                    aria-label="Commit actions"
                    className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[160px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-soft"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void onQuickCommitSubmit('commit')}
                      className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-xs text-foreground transition-colors hover:bg-surface-muted"
                    >
                      Commit
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void onQuickCommitSubmit('commit-and-push')}
                      className="flex h-9 w-full items-center rounded-lg px-2.5 text-left text-xs text-foreground transition-colors hover:bg-surface-muted"
                    >
                      Commit and push
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onOpenCommitModal}
                className={[
                  'inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium transition-colors',
                  'chat-send-button-enabled',
                ].join(' ')}
              >
                Advanced
              </button>
            </div>
          </div>

          {quickCommitError ? <p className="mt-2 text-xs text-danger-foreground">{quickCommitError}</p> : null}
          {syncError ? <p className="mt-2 text-xs text-danger-foreground">{syncError}</p> : null}
          {!syncError && syncMessage ? <p className="mt-2 text-xs text-muted-foreground">{syncMessage}</p> : null}
        </div>

        <div className={sectionBodyClassName}>
          {stagedFileDiffs.length > 0 ? (
            <section className={['min-h-0 flex flex-col', isStagedSectionOpen ? 'flex-1' : 'shrink-0'].join(' ')}>
              <button
                type="button"
                onClick={() => onStagedSectionOpenChange(!isStagedSectionOpen)}
                className="flex h-10 w-full items-center justify-between border-b border-border px-4 text-left"
              >
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Staged Changes</span>
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-border-muted text-[10px] font-medium leading-none text-foreground">
                    <span className="translate-x-px tabular-nums">{stagedFileCount}</span>
                  </span>
                </span>
                <ChevronDown size={13} className={['text-muted-foreground transition-transform', isStagedSectionOpen ? '' : '-rotate-90'].join(' ')} />
              </button>
              <div
                className={[
                  'min-h-0 transition-[opacity] duration-200',
                  isStagedSectionOpen ? 'flex flex-1 flex-col opacity-100' : 'hidden opacity-0',
                ].join(' ')}
              >
                <SourceControlDiffSection
                  bodyClassName={diffViewportClassName}
                  sectionClassName="border-b-0 min-h-0 flex flex-1 flex-col"
                  title=""
                  scope="staged"
                  diffs={stagedFileDiffs}
                  emptyLabel="No staged files."
                  expandedFilePaths={expandedChangeFilePaths}
                  pendingFileActionPath={pendingFileActionPath}
                  onDiscardFile={onDiscardFile}
                  onExpandedChange={onExpandedChange}
                  onStageFile={onStageFile}
                  onUnstageFile={onUnstageFile}
                />
              </div>
            </section>
          ) : null}

          {unstagedFileDiffs.length > 0 ? (
            <section
              className={[
                'min-h-0 flex flex-col',
                isUnstagedSectionOpen ? 'flex-1' : 'shrink-0',
                shouldShowUnstagedSectionTopBorder ? 'border-t border-border' : '',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => onUnstagedSectionOpenChange(!isUnstagedSectionOpen)}
                className={[
                  'flex h-10 w-full items-center justify-between px-4 text-left',
                  shouldShowUnstagedSectionBottomBorder ? 'border-b border-border' : '',
                ].join(' ')}
              >
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <span>Changes</span>
                  <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-border-muted text-[10px] font-medium leading-none text-foreground">
                    <span className="translate-x-px tabular-nums">{unstagedFileCount}</span>
                  </span>
                </span>
                <ChevronDown size={13} className={['text-muted-foreground transition-transform', isUnstagedSectionOpen ? '' : '-rotate-90'].join(' ')} />
              </button>
              <div
                className={[
                  'min-h-0 transition-[opacity] duration-200',
                  isUnstagedSectionOpen ? 'flex flex-1 flex-col opacity-100' : 'hidden opacity-0',
                ].join(' ')}
              >
                <SourceControlDiffSection
                  bodyClassName={diffViewportClassName}
                  sectionClassName="border-b-0 min-h-0 flex flex-1 flex-col"
                  title=""
                  scope="unstaged"
                  diffs={unstagedFileDiffs}
                  emptyLabel="No unstaged files."
                  expandedFilePaths={expandedChangeFilePaths}
                  pendingFileActionPath={pendingFileActionPath}
                  onDiscardFile={onDiscardFile}
                  onExpandedChange={onExpandedChange}
                  onStageFile={onStageFile}
                  onUnstageFile={onUnstageFile}
                />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  )
}
