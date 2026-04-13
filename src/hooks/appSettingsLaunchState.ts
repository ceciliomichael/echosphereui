import type { AppSettings } from '../types/chat'

export function resetLaunchOnlyAppSettings(input: AppSettings): AppSettings {
  return {
    ...input,
    terminalOpenByWorkspace: {},
  }
}

export function hasLaunchOnlyAppSettings(input: AppSettings): boolean {
  return Object.keys(input.terminalOpenByWorkspace).length > 0
}
