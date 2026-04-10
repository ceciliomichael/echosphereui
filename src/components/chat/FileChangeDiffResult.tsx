import { memo } from 'react'
import { DiffViewer } from './DiffViewer'
import type { ChangeDiffToolResultPresentation } from '../../types/chat'

interface FileChangeDiffResultProps {
  parsedResult: ChangeDiffToolResultPresentation
}

export const ChangeDiffResult = memo(function ChangeDiffResult({ parsedResult }: FileChangeDiffResultProps) {
  if (parsedResult.changes.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {parsedResult.changes.map((change) => (
        <div key={`${change.fileName}:${change.kind}`} className="space-y-2">
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
