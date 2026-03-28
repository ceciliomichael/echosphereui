import type { CSSProperties } from 'react'
import type { WorkspaceExplorerContextMenuState } from './workspaceExplorerPanelTypes'

export const ROOT_DIRECTORY_KEY = '.'

export function normalizeEntryPath(relativePath: string) {
  return relativePath.replace(/\\/g, '/')
}

export function toDirectoryKey(relativePath: string | undefined) {
  const normalized = normalizeEntryPath((relativePath ?? ROOT_DIRECTORY_KEY).trim())
    .replace(/^\.\/+/u, '')
    .replace(/\/+$/u, '')
  return normalized.length === 0 ? ROOT_DIRECTORY_KEY : normalized
}

export function isPathWithinTarget(relativePath: string, targetPath: string) {
  const normalizedRelativePath = normalizeEntryPath(relativePath)
  const normalizedTargetPath = normalizeEntryPath(targetPath)
  return normalizedRelativePath === normalizedTargetPath || normalizedRelativePath.startsWith(`${normalizedTargetPath}/`)
}

export function joinRelativePath(parentPath: string, childName: string) {
  const normalizedParentPath = normalizeEntryPath(parentPath).replace(/^\.\/+/u, '').replace(/\/+$/u, '')
  const normalizedChildName = normalizeEntryPath(childName).replace(/^\/+/u, '').replace(/\/+$/u, '')
  if (normalizedParentPath === '' || normalizedParentPath === ROOT_DIRECTORY_KEY) {
    return normalizedChildName
  }
  return `${normalizedParentPath}/${normalizedChildName}`
}

export function getWorkspaceExplorerContextMenuStyle(
  contextMenuState: WorkspaceExplorerContextMenuState | null,
  viewportSize: {
    width: number
    height: number
  },
): CSSProperties {
  if (!contextMenuState) {
    return {
      left: 0,
      top: 0,
      visibility: 'hidden',
    }
  }

  const menuWidth = 210
  const menuHeight = 280
  const viewportPadding = 8
  const left = Math.min(contextMenuState.position.x, viewportSize.width - menuWidth - viewportPadding)
  const top = Math.min(contextMenuState.position.y, viewportSize.height - menuHeight - viewportPadding)

  return {
    left: Math.max(left, viewportPadding),
    top: Math.max(top, viewportPadding),
    visibility: 'visible',
  }
}
