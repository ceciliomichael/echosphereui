export const DEFAULT_SIDEBAR_WIDTH = 336
export const MIN_SIDEBAR_WIDTH = DEFAULT_SIDEBAR_WIDTH

export function getMaxSidebarWidth(viewportWidth: number) {
  return DEFAULT_SIDEBAR_WIDTH + viewportWidth * 0.12
}
