import { memo } from 'react'
import { DiffViewer } from './DiffViewer'
import type { FileChangeDiffToolResultPresentation } from '../../types/chat'
import { getFileChangeActionLabel } from './toolInvocationPresentation'

interface FileChangeDiffResultProps {
  parsedResult: FileChangeDiffToolResultPresentation
}

export const FileChangeDiffResult = memo(function FileChangeDiffResult({ parsedResult }: FileChangeDiffResultProps) {
  if (parsedResult.changes.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {parsedResult.changes.map((change) => (
        <div key={`${change.fileName}:${change.kind}`} className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-medium text-muted-foreground">
            <span className="text-foreground">{getFileChangeActionLabel(change.kind)}</span>
            <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
            <span className="max-w-[18rem] truncate">{change.fileName}</span>
          </div>
          <DiffViewer
            filePath={change.fileName}
            headerTrailingContent={null}
            isStreaming={false}
            newContent={change.newContent}
            oldContent={change.oldContent}
            startLineNumber={change.startLineNumber}
            contextLines={change.contextLines}
            maxBodyHeightClassName="max-h-80"
          />
        </div>
      ))}
    </div>
  )
})
