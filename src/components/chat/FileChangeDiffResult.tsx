import { memo } from 'react'
import { DiffViewer } from './DiffViewer'
import type { FileChangeDiffToolResultPresentation } from '../../types/chat'

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
        <DiffViewer
          key={`${change.fileName}:${change.kind}`}
          filePath={change.fileName}
          headerTrailingContent={null}
          isStreaming={false}
          newContent={change.newContent}
          oldContent={change.oldContent}
          startLineNumber={change.startLineNumber}
          contextLines={change.contextLines}
          maxBodyHeightClassName="max-h-80"
        />
      ))}
    </div>
  )
})
