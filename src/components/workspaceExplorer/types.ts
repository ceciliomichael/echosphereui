export interface WorkspaceFileTab {
  content: string
  errorMessage?: string
  fileName: string
  isBinary: boolean
  isTruncated: boolean
  relativePath: string
  sizeBytes: number
  status: 'error' | 'loading' | 'ready'
}
