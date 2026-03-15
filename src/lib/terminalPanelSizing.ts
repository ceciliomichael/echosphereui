export const DEFAULT_TERMINAL_PANEL_HEIGHT = 260
export const MIN_TERMINAL_PANEL_HEIGHT = 180
export const MAX_TERMINAL_PANEL_HEIGHT = 620

export function clampStoredTerminalPanelHeight(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_PANEL_HEIGHT
  }

  const roundedValue = Math.round(value)
  return Math.max(MIN_TERMINAL_PANEL_HEIGHT, Math.min(MAX_TERMINAL_PANEL_HEIGHT, roundedValue))
}
