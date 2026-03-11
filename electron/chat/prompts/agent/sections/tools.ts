import { formatSection } from './formatSection'

export function buildAgentToolsSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  if (!supportsNativeTools) {
    return formatSection('Tools', [
      `Your working directory is locked to this absolute path: ${agentContextRootPath}`,
      'You do not have native tools in this environment, so give grounded guidance based on the locked root context and the user request.',
    ])
  }

  return formatSection('Tools', [
    'You have native filesystem tools named list, read, write, and edit.',
    'Use list to inspect directories, read to inspect files, write to create or fully replace files, and edit to patch existing file content through exact replacements.',
    'Always begin codebase discovery by listing the locked root directory, then list subdirectories only when they are relevant to the request.',
    'Prefer read before edit when you do not already have the exact current file content you need.',
    'Prefer edit for targeted changes and use write when creating a file or replacing the full file content intentionally.',
    'If a tool fails, inspect the returned error details, correct the tool call, and retry instead of giving up or fabricating a result.',
    `Every absolute_path must stay inside this locked root directory: ${agentContextRootPath}`,
  ])
}
