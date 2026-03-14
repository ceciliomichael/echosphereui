import { resolveFileIconConfig } from '../../lib/fileIconResolver'
import { getPathBasename } from '../../lib/pathPresentation'
import type { GitHistoryCommitFile } from '../../types/chat'
import { Tooltip } from '../Tooltip'

function FileStatusBadge({ status }: { status: string }) {
  const key = status.toUpperCase().charAt(0)
  const colorMap: Record<string, string> = {
    A: 'text-emerald-500',
    D: 'text-red-500',
    M: 'text-amber-500',
    R: 'text-blue-500',
  }

  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${colorMap[key] ?? 'text-muted-foreground'}`}>
      {key}
    </span>
  )
}

function getStatusLabel(status: string) {
  const key = status.toUpperCase().charAt(0)
  if (key === 'A') {
    return 'Added'
  }
  if (key === 'D') {
    return 'Deleted'
  }
  if (key === 'R') {
    return 'Renamed'
  }
  return 'Modified'
}

function splitFilePath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  const fileName = getPathBasename(normalizedPath)
  if (fileName === normalizedPath) {
    return {
      directoryPath: '',
      fileName,
      normalizedPath,
    }
  }

  return {
    directoryPath: normalizedPath.slice(0, normalizedPath.length - fileName.length).replace(/\/$/u, ''),
    fileName,
    normalizedPath,
  }
}

export function CommitFileRow({ file, indentPx }: { file: GitHistoryCommitFile; indentPx: number }) {
  const iconConfig = resolveFileIconConfig({ fileName: file.path })
  const FileIcon = iconConfig.icon
  const { directoryPath, fileName, normalizedPath } = splitFilePath(file.path)

  return (
    <Tooltip
      content={
        <div className="flex min-w-[18rem] flex-col gap-1 font-sans">
          <p className="text-[13px] text-tooltip-foreground">{normalizedPath}</p>
          <p className="text-[13px] text-tooltip-foreground">{getStatusLabel(file.status)}</p>
        </div>
      }
      side="right"
      fullWidthTrigger
      hideDelayMs={220}
      interactive
    >
      <div
        className="group flex h-[50px] w-full items-center transition-colors hover:bg-surface-muted/50"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <div className="flex h-full min-w-0 flex-1 items-center gap-2.5 border-l border-border/50 px-3 text-[12.5px] text-muted-foreground">
          <FileIcon size={14} style={{ color: iconConfig.color }} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left" title={normalizedPath}>
            <span className="text-foreground">{fileName}</span>
            {directoryPath.length > 0 ? <span className="ml-1 text-muted-foreground/80">{directoryPath}</span> : null}
          </span>
          <FileStatusBadge status={file.status} />
        </div>
      </div>
    </Tooltip>
  )
}
