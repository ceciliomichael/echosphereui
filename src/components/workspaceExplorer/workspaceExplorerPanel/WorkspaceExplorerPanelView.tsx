import { ChevronRight, File, Folder, FolderOpen, RefreshCw } from 'lucide-react'
import { createPortal } from 'react-dom'
import { resolveFileIconConfig } from '../../../lib/fileIconResolver'
import type { WorkspaceExplorerEntry } from '../../../types/chat'
import type { WorkspaceExplorerPanelProps } from './workspaceExplorerPanelTypes'
import type { WorkspaceExplorerPanelState } from './useWorkspaceExplorerPanelState'
import { ROOT_DIRECTORY_KEY, isPathWithinTarget, normalizeEntryPath } from './workspaceExplorerPanelUtils'

interface WorkspaceExplorerPanelViewProps extends WorkspaceExplorerPanelProps {
  panelState: WorkspaceExplorerPanelState
}

export function WorkspaceExplorerPanelView({
  activeFilePath,
  clipboardEntry,
  onOpenFile,
  panelState,
}: WorkspaceExplorerPanelViewProps) {
  function renderCreationRow(depth: number) {
    const draft = panelState.creationDraft
    if (!draft) {
      return null
    }

    return (
      <li key={`create-${draft.parentPath}-${draft.isDirectory ? 'folder' : 'file'}`} className="min-w-0">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void panelState.submitCreateEntry()
          }}
          className="flex h-8 w-full min-w-0 items-center gap-1 bg-surface-muted px-2 text-left text-sm text-foreground"
          style={{ paddingLeft: `${Math.max(8, depth * 12 + 8)}px` }}
        >
          <span className="w-[14px] shrink-0" />
          {draft.isDirectory ? (
            <Folder size={14} className="shrink-0 text-subtle-foreground" />
          ) : (
            <File size={14} className="shrink-0 text-subtle-foreground" />
          )}
          <input
            ref={panelState.creationInputRef}
            value={panelState.creationName}
            onChange={(event) => panelState.onCreationNameChange(event.target.value)}
            onBlur={() => {
              if (panelState.isSubmittingCreationRef.current) {
                return
              }
              panelState.cancelCreateEntry()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                panelState.cancelCreateEntry()
              }
            }}
            placeholder={draft.isDirectory ? 'folder-name' : 'file-name'}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
          />
        </form>
      </li>
    )
  }

  function renderEntries(entries: readonly WorkspaceExplorerEntry[], depth: number): JSX.Element[] {
    return entries.flatMap((entry) => {
      const isDirectory = entry.isDirectory
      const entryPath = normalizeEntryPath(entry.relativePath)
      const isExpanded = isDirectory && panelState.expandedDirectories.has(entryPath)
      const isLoading = isDirectory && panelState.loadingDirectories.has(entryPath)
      const isActiveFile = !isDirectory && activeFilePath === entry.relativePath
      const isContextTarget = panelState.contextMenuState?.targetEntry?.relativePath === entry.relativePath
      const isDropTarget = isDirectory && panelState.dropTargetDirectoryPath === entry.relativePath
      const isCutEntry =
        clipboardEntry?.mode === 'cut' && isPathWithinTarget(entry.relativePath, clipboardEntry.relativePath)
      const nestedEntries = isDirectory ? panelState.directoryEntriesByPath[entryPath] ?? [] : []
      const fileIconConfig = !isDirectory ? resolveFileIconConfig({ fileName: entry.relativePath }) : null
      const FileIcon = fileIconConfig?.icon

      const row = (
        <li key={entry.relativePath} className="min-w-0">
          <button
            type="button"
            draggable
            onClick={() => (isDirectory ? panelState.toggleDirectory(entry) : onOpenFile(entry.relativePath))}
            onContextMenu={(event) => panelState.openContextMenu(event, entry)}
            onDragStart={(event) => panelState.handleEntryDragStart(event, entry)}
            onDragEnd={panelState.handleEntryDragEnd}
            onDragOver={isDirectory ? (event) => panelState.handleDirectoryDragOver(event, entry.relativePath) : undefined}
            onDragLeave={isDirectory ? (event) => panelState.handleDirectoryDragLeave(event, entry.relativePath) : undefined}
            onDrop={isDirectory ? (event) => panelState.handleDirectoryDrop(event, entry.relativePath) : undefined}
            className={[
              'flex h-8 w-full min-w-0 items-center gap-1 rounded-none px-2 text-left text-sm transition-colors',
              isCutEntry ? 'opacity-55' : '',
              isDropTarget ? 'bg-surface-muted text-foreground' : '',
              isActiveFile || isContextTarget
                ? 'bg-surface-muted text-foreground'
                : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
            ].join(' ')}
            style={{ paddingLeft: `${Math.max(8, depth * 12 + 8)}px` }}
          >
            {isDirectory ? (
              <ChevronRight size={14} className={['shrink-0 transition-transform', isExpanded ? 'rotate-90' : ''].join(' ')} />
            ) : (
              <span className="w-[14px] shrink-0" />
            )}
            {isDirectory ? (
              isExpanded ? (
                <FolderOpen size={14} className="shrink-0 text-subtle-foreground" />
              ) : (
                <Folder size={14} className="shrink-0 text-subtle-foreground" />
              )
            ) : FileIcon ? (
              <FileIcon size={14} className="shrink-0" style={{ color: fileIconConfig?.color }} />
            ) : null}
            <span className="truncate">{entry.name}</span>
            {isLoading ? <RefreshCw size={12} className="ml-auto shrink-0 animate-spin text-subtle-foreground" /> : null}
          </button>
        </li>
      )

      if (!isDirectory || !isExpanded) {
        return [row]
      }

      const creationRow =
        panelState.creationDraft && entryPath === normalizeEntryPath(panelState.creationDraft.parentPath)
          ? renderCreationRow(depth + 1)
          : null

      return [row, ...renderEntries(nestedEntries, depth + 1), ...(creationRow ? [creationRow] : [])]
    })
  }

  const showExplorerTree = panelState.rootEntries.length > 0 || Boolean(panelState.creationDraft)

  return (
    <aside
      className={[
        'relative hidden h-full shrink-0 min-w-0 flex-col overflow-hidden border-l border-border bg-background md:flex',
      ].join(' ')}
      style={{ width: `${panelState.renderedWidth}px` }}
    >
      <div className="flex h-11 items-center justify-between pl-5 pr-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle-foreground">Explorer</p>
      </div>
      <div
        className={[
          'min-h-0 flex-1 overflow-y-auto py-2',
          panelState.dropTargetDirectoryPath === ROOT_DIRECTORY_KEY ? 'bg-surface/60' : '',
        ].join(' ')}
        onContextMenu={(event) => panelState.openContextMenu(event, null)}
        onDragOver={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          panelState.handleDirectoryDragOver(event, ROOT_DIRECTORY_KEY)
        }}
        onDragLeave={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          panelState.handleDirectoryDragLeave(event, ROOT_DIRECTORY_KEY)
        }}
        onDrop={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          panelState.handleDirectoryDrop(event, ROOT_DIRECTORY_KEY)
        }}
      >
        {!panelState.isWorkspaceConfigured ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-subtle-foreground">
            Select a workspace folder to use Explorer.
          </p>
        ) : panelState.errorMessage ? (
          <div className="rounded-xl border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            {panelState.errorMessage}
          </div>
        ) : !showExplorerTree ? (
          <button
            type="button"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-subtle-foreground"
          >
            No files found in this workspace.
          </button>
        ) : (
          <ul
            onDragOver={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }
              panelState.handleDirectoryDragOver(event, ROOT_DIRECTORY_KEY)
            }}
            onDragLeave={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }
              panelState.handleDirectoryDragLeave(event, ROOT_DIRECTORY_KEY)
            }}
            onDrop={(event) => {
              if (event.target !== event.currentTarget) {
                return
              }
              panelState.handleDirectoryDrop(event, ROOT_DIRECTORY_KEY)
            }}
          >
            {renderEntries(panelState.rootEntries, 0)}
            {panelState.creationDraft && normalizeEntryPath(panelState.creationDraft.parentPath) === ROOT_DIRECTORY_KEY
              ? renderCreationRow(0)
              : null}
          </ul>
        )}
      </div>
      {panelState.contextMenuState
        ? createPortal(
            <div
              ref={panelState.contextMenuRef}
              role="menu"
              aria-label="Explorer actions"
              data-floating-menu-root="true"
              className="fixed z-[1200] min-w-[210px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-soft"
              style={panelState.contextMenuStyle}
            >
              {!panelState.contextMenuState.targetEntry || panelState.contextMenuState.targetEntry.isDirectory ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => panelState.startCreateEntry(false)}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    New File
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => panelState.startCreateEntry(true)}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    New Folder
                  </button>
                  {clipboardEntry ? (
                    <>
                      <div className="my-1 h-px bg-border" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() =>
                          void panelState.submitPasteEntry(
                            panelState.contextMenuState?.targetEntry?.isDirectory
                              ? panelState.contextMenuState.targetEntry.relativePath
                              : ROOT_DIRECTORY_KEY,
                          )
                        }
                        className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                      >
                        Paste
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              {panelState.contextMenuState.targetEntry?.isDirectory ? (
                <>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={panelState.requestDeleteEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-danger-foreground transition-colors hover:bg-danger-surface"
                  >
                    Delete Folder
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={panelState.requestRenameEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Rename
                  </button>
                </>
              ) : null}
              {panelState.contextMenuState.targetEntry && !panelState.contextMenuState.targetEntry.isDirectory ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={panelState.requestDeleteEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-danger-foreground transition-colors hover:bg-danger-surface"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={panelState.requestRenameEntry}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => panelState.requestCopyOrCutEntry('cut')}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Cut
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => panelState.requestCopyOrCutEntry('copy')}
                    className="flex h-10 w-full items-center rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-surface-muted"
                  >
                    Copy
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer panel"
        onPointerDown={panelState.handleResizePointerDown}
        className="absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
      />
    </aside>
  )
}
