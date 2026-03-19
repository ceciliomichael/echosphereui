import type { AppTerminalExecutionMode } from '../../../../src/types/chat'
import { formatSection } from './formatSection'

function getHostPlatformLabel(platform: NodeJS.Platform) {
  if (platform === 'win32') {
    return 'Windows'
  }

  if (platform === 'darwin') {
    return 'macOS'
  }

  if (platform === 'linux') {
    return 'Linux'
  }

  return platform
}

function getDefaultShellLabel(platform: NodeJS.Platform, terminalExecutionMode?: AppTerminalExecutionMode) {
  if (platform === 'win32') {
    return terminalExecutionMode === 'sandbox' ? 'wsl.exe -> bash' : 'powershell.exe'
  }

  return process.env.SHELL?.trim() || '/bin/bash'
}

export function buildShellContextSection(terminalExecutionMode?: AppTerminalExecutionMode) {
  const hostPlatform = process.platform
  const hostPlatformLabel = getHostPlatformLabel(hostPlatform)
  const defaultShellLabel = getDefaultShellLabel(hostPlatform, terminalExecutionMode)

  return formatSection('Shell Context', [
    `Host platform: \`${hostPlatformLabel}\` (\`${hostPlatform}\`)`,
    `Terminal execution mode: \`${terminalExecutionMode ?? 'unspecified'}\``,
    `Default shell for this runtime: \`${defaultShellLabel}\``,
    hostPlatform === 'win32'
      ? 'Sandbox mode routes commands through WSL when available; Full mode uses the native Windows shell.'
      : 'Use the configured host shell for direct command execution and keep shell assumptions aligned with the tool arguments.',
    'Treat the shell selected for the command as authoritative for that tool call.',
  ])
}
