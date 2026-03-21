export const DEFAULT_WORKSPACE_EXPLORER_WIDTH = 300
export const MIN_WORKSPACE_EXPLORER_WIDTH = 100
export const MAX_WORKSPACE_EXPLORER_WIDTH = 520

export function getMaxWorkspaceExplorerWidth(viewportWidth: number) {
  const softMax = Math.round(viewportWidth * 0.4)
  return Math.max(MIN_WORKSPACE_EXPLORER_WIDTH, Math.min(MAX_WORKSPACE_EXPLORER_WIDTH, softMax))
}

export function clampWorkspaceExplorerWidth(explorerWidth: number, viewportWidth: number) {
  return Math.min(
    Math.max(Math.round(explorerWidth), MIN_WORKSPACE_EXPLORER_WIDTH),
    getMaxWorkspaceExplorerWidth(viewportWidth),
  )
}
