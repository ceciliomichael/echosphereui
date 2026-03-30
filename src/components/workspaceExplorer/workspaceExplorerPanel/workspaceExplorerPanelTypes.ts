import type { WorkspaceExplorerEntry } from '../../../types/chat'

export interface WorkspaceClipboardEntry {
  mode: 'copy' | 'cut'
  relativePath: string
}

export interface WorkspaceExplorerPanelProps {
  activeFilePath: string | null
  clipboardEntry: WorkspaceClipboardEntry | null
  isOpen: boolean
  onCopyEntry: (relativePath: string) => Promise<void>
  onCreateEntry: (relativePath: string, isDirectory: boolean) => Promise<void>
  onCutEntry: (relativePath: string) => Promise<void>
  onDeleteEntry: (relativePath: string) => Promise<void>
  onMoveEntry: (relativePath: string, targetDirectoryRelativePath: string) => Promise<void>
  onImportEntry: (sourcePath: string, targetDirectoryRelativePath: string) => Promise<void>
  onOpenFile: (relativePath: string) => void
  onPasteEntry: (targetDirectoryRelativePath: string) => Promise<void>
  onRenameEntry: (relativePath: string, nextRelativePath: string) => Promise<void>
  onWidthChange: (nextWidth: number) => void
  onWidthCommit: (nextWidth: number) => void
  width: number
  workspaceRootPath: string | null
}

export interface WorkspaceExplorerContextMenuState {
  position: {
    x: number
    y: number
  }
  targetEntry: WorkspaceExplorerEntry | null
}

export interface PendingExplorerCreation {
  isDirectory: boolean
  parentPath: string
}
