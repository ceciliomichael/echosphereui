import { memo } from 'react'
import { WorkspaceFileEditorView } from './workspaceFileEditor/WorkspaceFileEditorView'
import { useWorkspaceFileEditorState } from './workspaceFileEditor/useWorkspaceFileEditorState'

interface WorkspaceFileEditorProps {
  fileName: string
  value: string
  wordWrapEnabled: boolean
  onChange: (nextValue: string) => void
}

export const WorkspaceFileEditor = memo(function WorkspaceFileEditor({
  fileName,
  value,
  wordWrapEnabled,
  onChange,
}: WorkspaceFileEditorProps) {
  const editorState = useWorkspaceFileEditorState({
    fileName,
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
