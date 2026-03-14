import { Loader2, Minus, Plus, Undo2 } from 'lucide-react'
import type { ConversationFileDiff } from '../../lib/chatDiffs'
import { DiffViewer } from '../chat/DiffViewer'
import { Tooltip } from '../Tooltip'

interface SourceControlDiffSectionProps {
  bodyClassName?: string
  diffs: readonly ConversationFileDiff[]
  emptyLabel: string
  expandedFilePaths: readonly string[]
  pendingFileActionPath: string | null
  sectionClassName?: string
  scope: 'staged' | 'unstaged'
  title: string
  onDiscardFile: (filePath: string) => Promise<void>
  onExpandedChange: (filePath: string, nextValue: boolean) => void
  onStageFile: (filePath: string) => Promise<void>
  onUnstageFile: (filePath: string) => Promise<void>
}

function DiffSummaryInline({ addedLineCount, removedLineCount }: { addedLineCount: number; removedLineCount: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium">
      <span className="text-emerald-600 dark:text-emerald-400">{`+${addedLineCount}`}</span>
      <span className="text-red-600 dark:text-red-400">{`-${removedLineCount}`}</span>
    </span>
  )
}

function buildFileActionButtons(input: {
  fileDiff: ConversationFileDiff
  pendingFileActionPath: string | null
  onDiscardFile: (filePath: string) => Promise<void>
  onStageFile: (filePath: string) => Promise<void>
  onUnstageFile: (filePath: string) => Promise<void>
  scope: 'staged' | 'unstaged'
}) {
  const { fileDiff, onDiscardFile, onStageFile, onUnstageFile, pendingFileActionPath, scope } = input
  const isPending = pendingFileActionPath === fileDiff.fileName

  if (scope === 'staged') {
    return (
      <Tooltip content="Unstage file" side="top">
        <button
          type="button"
          aria-label={`Unstage ${fileDiff.fileName}`}
          disabled={isPending}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void onUnstageFile(fileDiff.fileName)
          }}
          className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Minus size={14} />}
        </button>
      </Tooltip>
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <Tooltip content="Discard changes" side="top">
        <button
          type="button"
          aria-label={`Discard ${fileDiff.fileName}`}
          disabled={isPending}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void onDiscardFile(fileDiff.fileName)
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
        </button>
      </Tooltip>
      <button
        type="button"
        aria-label={`Stage ${fileDiff.fileName}`}
        disabled={isPending}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void onStageFile(fileDiff.fileName)
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
      </button>
    </span>
  )
}

export function SourceControlDiffSection({
  bodyClassName,
  diffs,
  emptyLabel,
  expandedFilePaths,
  pendingFileActionPath,
  sectionClassName,
  scope,
  title,
  onDiscardFile,
  onExpandedChange,
  onStageFile,
  onUnstageFile,
}: SourceControlDiffSectionProps) {
  return (
    <section className={['border-b border-border', sectionClassName ?? ''].join(' ').trim()}>
      {title.length > 0 ? (
        <div className="shrink-0 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      ) : null}
      <div className={bodyClassName ?? ''}>
        {diffs.length === 0 ? (
          <div className="flex min-h-16 items-center px-4 py-3">
            <p className="text-[12px] text-muted-foreground">{emptyLabel}</p>
          </div>
        ) : (
          diffs.map((fileDiff) => (
            <DiffViewer
              key={`${scope}-${fileDiff.fileName}`}
              collapsible
              defaultExpanded={false}
              filePath={fileDiff.fileName}
              isExpanded={expandedFilePaths.includes(fileDiff.fileName)}
              newContent={fileDiff.newContent}
              oldContent={fileDiff.oldContent}
              contextLines={fileDiff.contextLines}
              layout="stacked"
              startLineNumber={fileDiff.startLineNumber}
              onExpandedChange={(nextValue) => onExpandedChange(fileDiff.fileName, nextValue)}
              headerClassName="px-4 py-2.5 text-[12px]"
              headerInlineContent={<DiffSummaryInline addedLineCount={fileDiff.addedLineCount} removedLineCount={fileDiff.removedLineCount} />}
              headerRightContent={buildFileActionButtons({
                fileDiff,
                onDiscardFile,
                onStageFile,
                onUnstageFile,
                pendingFileActionPath,
                scope,
              })}
            />
          ))
        )}
      </div>
    </section>
  )
}
