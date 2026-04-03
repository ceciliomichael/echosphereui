import { memo } from 'react'
import { WorkspaceMarkdownPreviewView } from './WorkspaceMarkdownPreviewView'

interface WorkspaceMarkdownPreviewProps {
  content: string
  fileName: string
  isTruncated?: boolean
}

export const WorkspaceMarkdownPreview = memo(function WorkspaceMarkdownPreview({
  content,
  fileName,
  isTruncated = false,
}: WorkspaceMarkdownPreviewProps) {
  return <WorkspaceMarkdownPreviewView content={content} fileName={fileName} isTruncated={isTruncated} />
})
