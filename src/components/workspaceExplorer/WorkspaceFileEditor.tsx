import { memo } from 'react'
import { WorkspaceFileEditorView } from './workspaceFileEditor/WorkspaceFileEditorView'
import { useWorkspaceFileEditorState } from './workspaceFileEditor/useWorkspaceFileEditorState'

interface WorkspaceFileEditorProps {
  fileName: string
  onOpenMarkdownPreview?: () => void
  value: string
  wordWrapEnabled: boolean
  onChange: (nextValue: string) => void
}

export const WorkspaceFileEditor = memo(function WorkspaceFileEditor({
  fileName,
  onOpenMarkdownPreview,
  value,
  wordWrapEnabled,
  onChange,
}: WorkspaceFileEditorProps) {
  const editorState = useWorkspaceFileEditorState({
    fileName,
    onOpenMarkdownPreview,
    onChange,
    value,
    wordWrapEnabled,
  })

  return (
    <WorkspaceFileEditorView
      editorState={editorState}
      fileName={fileName}
      onChange={onChange}
      value={value}
      wordWrapEnabled={wordWrapEnabled}
    />
  )
})
