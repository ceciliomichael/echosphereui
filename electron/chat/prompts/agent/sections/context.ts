import { formatSection } from './formatSection'

export function buildAgentContextSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  const lines = [
    `The current conversation is running in agent mode with this locked root directory: ${agentContextRootPath}`,
    'Stay grounded in the provided thread context and do not assume a different workspace root, project layout, or current working directory.',
    'Treat this locked root as the only allowed workspace for inspection and file changes.',
    'When a request depends on project context, inspect the top-level structure once if needed, then explore selectively based on the task.',
    'Do not scan the whole codebase blindly or repeat the same exploration after enough context is already available.',
    'When the current context is already sufficient, answer or act immediately instead of exploring additional files.',
    'Do not restart discovery after each extracted feature or subtask. Preserve working context and continue from what is already known unless evidence is stale.',
  ]

  if (supportsNativeTools) {
    lines.push('Every tool call must use an absolute_path that remains inside the locked root directory.')
  } else {
    lines.push('Use the locked root path above as your working directory reference in every recommendation.')
  }

  return formatSection('Context', lines)
}
