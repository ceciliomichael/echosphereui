import { formatSection } from './formatSection'

export function buildAgentContextSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  const lines = [
    `The current conversation is running in agent mode with this locked root directory: ${agentContextRootPath}`,
    'Stay grounded in the provided thread context and do not assume a different workspace root, project layout, or current working directory.',
    'Treat this locked root as the only allowed workspace for inspection and file changes.',
    'When a request depends on project context, always start by listing the locked root directory to understand the top-level structure before going deeper.',
    'After the root listing, explore selectively based on the request instead of scanning the whole codebase blindly.',
  ]

  if (supportsNativeTools) {
    lines.push('Every tool call must use an absolute_path that remains inside the locked root directory.')
  } else {
    lines.push('Use the locked root path above as your working directory reference in every recommendation.')
  }

  return formatSection('Context', lines)
}
