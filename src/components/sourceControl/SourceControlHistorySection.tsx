import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Loader2,
  LocateFixed,
  RefreshCw,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react'
import type { GitHistoryCommitDetailsResult, GitHistoryCommitFile, GitSyncAction } from '../../types/chat'
import { Tooltip } from '../Tooltip'
import { CommitFileRow } from './CommitFileRow'
import { CommitHistoryTooltipContent } from './CommitHistoryTooltipContent'
import { GitGraphLane, GitGraphPlaceholder } from './historyGraph'
import { getSwimlaneIndentPx, type HistoryItemViewModel } from './historyGraphLayout'

interface SyncActionConfig {
  action: GitSyncAction
  icon: LucideIcon
  label: string
}

const SYNC_ACTIONS: readonly SyncActionConfig[] = [
  {
    action: 'fetch-all',
    icon: Upload,
    label: 'Fetch all remotes',
  },
  {
    action: 'pull',
    icon: ArrowDownToLine,
    label: 'Pull latest changes',
  },
  {
    action: 'push',
    icon: ArrowUpToLine,
    label: 'Push current branch',
  },
]

interface SourceControlHistorySectionProps {
  commitDetailsByHash: Readonly<Record<string, GitHistoryCommitDetailsResult>>
  expandedCommitHashes: readonly string[]
  hasMoreHistory: boolean
  hasWorkspacePath: boolean
  headHash: string | null
  historyEntries: readonly HistoryItemViewModel['entry'][]
  historyError: string | null
  historyHeight: number | null
  historyRowRefMap: MutableRefObject<Map<string, HTMLButtonElement | null>>
  historyViewModels: readonly HistoryItemViewModel[]
  isHistorySectionOpen: boolean
  isLoadingHistory: boolean
  isLoadingMoreHistory: boolean
  loadingCommitHashes: readonly string[]
  pendingSyncAction: GitSyncAction | 'refresh' | null
  selectedCommitHash: string | null
  onGoToCurrentCommit: () => Promise<void>
  onHistoryResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onLoadCommitDetails: (commitHash: string) => Promise<void>
  onLoadMoreHistory: () => Promise<void>
  onRefreshPanel: () => Promise<void>
  onSyncAction: (action: GitSyncAction) => Promise<void>
  onToggleCommitExpanded: (commitHash: string) => void
  onToggleHistorySection: () => void
}

function renderCommitDetails(input: {
  commitHash: string
  files: readonly GitHistoryCommitFile[]
  laneColumnCount: number
  loadingCommitHashes: readonly string[]
}) {
  const { commitHash, files, laneColumnCount, loadingCommitHashes } = input
  const isLoadingCommitDetails = loadingCommitHashes.includes(commitHash)
  const indentPx = getSwimlaneIndentPx(laneColumnCount)

  if (isLoadingCommitDetails) {
    return (
      <div className="flex items-center gap-2 py-2 pr-3 text-[12px] text-muted-foreground" style={{ paddingLeft: `${indentPx + 12}px` }}>
        <Loader2 size={13} className="animate-spin" />
        Loading files...
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="py-2 pr-3 text-[12px] text-muted-foreground" style={{ paddingLeft: `${indentPx + 12}px` }}>
        No changed files.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {files.map((file) => (
        <CommitFileRow key={`${commitHash}-${file.path}`} file={file} indentPx={indentPx} />
      ))}
    </div>
  )
}

export function SourceControlHistorySection({
  commitDetailsByHash,
  expandedCommitHashes,
  hasMoreHistory,
  hasWorkspacePath,
  headHash,
  historyEntries,
  historyError,
  historyHeight,
  historyRowRefMap,
  historyViewModels,
  isHistorySectionOpen,
  isLoadingHistory,
  isLoadingMoreHistory,
  loadingCommitHashes,
  pendingSyncAction,
  selectedCommitHash,
  onGoToCurrentCommit,
  onHistoryResizePointerDown,
  onLoadCommitDetails,
  onLoadMoreHistory,
  onRefreshPanel,
  onSyncAction,
  onToggleCommitExpanded,
  onToggleHistorySection,
}: SourceControlHistorySectionProps) {
  return (
    <section
      className={[
        'border-b border-border',
        isHistorySectionOpen ? 'min-h-0 shrink-0 flex flex-1 flex-col' : 'shrink-0',
      ].join(' ')}
      style={
        isHistorySectionOpen && historyHeight !== null
          ? {
              flex: '0 0 auto',
              height: `${historyHeight}px`,
            }
          : undefined
      }
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize history section"
        onPointerDown={onHistoryResizePointerDown}
        className={[
          'h-1 w-full bg-transparent',
          isHistorySectionOpen ? 'cursor-row-resize' : 'cursor-default',
        ].join(' ')}
      />
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isHistorySectionOpen}
        onClick={onToggleHistorySection}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return
          }

          event.preventDefault()
          onToggleHistorySection()
        }}
        className="flex h-10 cursor-pointer items-center justify-between px-4"
      >
        <span className="inline-flex items-center gap-2 text-left">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">History</span>
          <ChevronDown
            size={13}
            className={['text-muted-foreground transition-transform', isHistorySectionOpen ? '' : '-rotate-90'].join(' ')}
          />
        </span>
        <div className="inline-flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
          {SYNC_ACTIONS.map((config) => {
            const Icon = config.icon
            const isPending = pendingSyncAction === config.action

            return (
              <Tooltip key={config.action} content={config.label} side="top">
                <button
                  type="button"
                  aria-label={config.label}
                  disabled={!hasWorkspacePath || pendingSyncAction !== null}
                  onClick={() => void onSyncAction(config.action)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                </button>
              </Tooltip>
            )
          })}

          <Tooltip content="Refresh source control" side="top">
            <button
              type="button"
              aria-label="Refresh source control"
              disabled={!hasWorkspacePath || pendingSyncAction !== null}
              onClick={() => void onRefreshPanel()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingSyncAction === 'refresh' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          </Tooltip>

          <Tooltip content="Go to HEAD commit" side="top">
            <button
              type="button"
              aria-label="Go to HEAD commit"
              disabled={!headHash}
              onClick={() => void onGoToCurrentCommit()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LocateFixed size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className={['min-h-0 flex-1 overflow-y-auto border-t border-border transition-[opacity] duration-200', isHistorySectionOpen ? 'opacity-100' : 'hidden opacity-0'].join(' ')}>
        {isLoadingHistory ? (
          <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Loading history...
          </div>
        ) : historyEntries.length === 0 ? (
          <div className="px-4 py-3">
            <div className="flex min-h-16 items-center text-[12px] text-muted-foreground">No commits yet.</div>
          </div>
        ) : (
          <div>
            {historyViewModels.map((viewModel) => {
              const { entry } = viewModel
              const isExpanded = expandedCommitHashes.includes(entry.hash)
              const isSelected = selectedCommitHash === entry.hash
              const commitDetails = commitDetailsByHash[entry.hash]
              const isLoadingDetails = loadingCommitHashes.includes(entry.hash)
              const continuationColumns =
                viewModel.outputSwimlanes.length > 0 ? viewModel.outputSwimlanes : viewModel.inputSwimlanes

              return (
                <div key={entry.hash}>
                  <Tooltip
                    content={
                      <CommitHistoryTooltipContent
                        entry={entry}
                        details={commitDetails}
                        isLoadingDetails={isLoadingDetails}
                      />
                    }
                    side="right"
                    fullWidthTrigger
                    interactive
                    panelClassName="!max-w-[min(42rem,calc(100vw-24px))] !border-0 !bg-transparent !p-0 !text-left !shadow-none"
                  >
                    <button
                      type="button"
                      ref={(node) => {
                        historyRowRefMap.current.set(entry.hash, node)
                      }}
                      onClick={() => onToggleCommitExpanded(entry.hash)}
                      onMouseEnter={() => {
                        void onLoadCommitDetails(entry.hash)
                      }}
                      onFocus={() => {
                        void onLoadCommitDetails(entry.hash)
                      }}
                      className={[
                        'flex h-[50px] w-full items-center gap-0 text-left transition-colors',
                        isSelected ? 'bg-surface-muted' : 'hover:bg-surface-muted/50',
                      ].join(' ')}
                    >
                      <GitGraphLane viewModel={viewModel} />

                      <span className="min-w-0 flex-1 py-1.5 pr-2">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 shrink truncate text-[13px] font-medium leading-5 text-foreground">
                            {entry.subject.length > 0 ? entry.subject : '(no subject)'}
                          </span>
                          <span className="ml-auto shrink-0 pl-2 text-subtle-foreground">
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </span>
                        </span>
                      </span>
                    </button>
                  </Tooltip>

                  {isExpanded ? (
                    <div className="relative flex bg-surface-muted/10">
                      <div className="z-10 min-w-0 flex-1">
                        {renderCommitDetails({
                          commitHash: entry.hash,
                          files: commitDetails?.files ?? [],
                          laneColumnCount: continuationColumns.length,
                          loadingCommitHashes,
                        })}
                      </div>
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-fit">
                        <GitGraphPlaceholder columns={continuationColumns} />
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {historyError ? <p className="px-4 py-2 text-xs text-danger-foreground">{historyError}</p> : null}

            {hasMoreHistory ? (
              <div className="px-4 py-3">
                <button
                  type="button"
                  disabled={isLoadingMoreHistory}
                  onClick={() => void onLoadMoreHistory()}
                  className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-border bg-surface-muted/50 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingMoreHistory ? (
                    <>
                      <Loader2 size={13} className="mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load more commits'
                  )}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
