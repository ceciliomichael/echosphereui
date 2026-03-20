import type { AppTerminalExecutionMode } from '../../../../src/types/chat'

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

  return [
    '<shell_context>',
    '## Shell Context',
    `Host platform is \`${hostPlatformLabel}\` (\`${hostPlatform}\`). Terminal execution mode is \`${terminalExecutionMode ?? 'unspecified'}\`. Default shell for this runtime is \`${defaultShellLabel}\`.`,
    'Treat the selected shell as authoritative for the command, and keep command syntax aligned with the shell you actually invoke.',
    '</shell_context>',
  ].join('\n')
}
