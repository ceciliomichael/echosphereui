import type { AppSettings } from '../types/chat'

export function resetLaunchOnlyAppSettings(input: AppSettings): AppSettings {
  return {
    ...input,
    terminalOpenByWorkspace: {},
  }
}
