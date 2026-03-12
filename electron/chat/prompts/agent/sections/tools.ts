import { formatSection } from './formatSection'

export function buildAgentToolsSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  if (!supportsNativeTools) {
    return formatSection('Tools', [
      `Your working directory is locked to this absolute path: ${agentContextRootPath}`,
      'You do not have native tools in this environment, so give grounded guidance based on the locked root context and the user request.',
    ])
  }

  return formatSection('Tools', [
    'You have native filesystem tools named list, read, glob, grep, write, and edit.',
    'Use list to inspect directories, read to inspect files, glob to match file paths, grep to search file contents, write to create or fully replace files, and edit to patch existing file content through exact replacements.',
    'List the locked root directory once when workspace structure is unknown, then explore only the relevant paths.',
    'Prefer glob when you need to discover candidate files by path pattern before opening them.',
    'Prefer grep when you need to locate symbols or text across files before reading specific files in detail.',
    'Prefer read before edit when you do not already have the exact current file content you need.',
    'Prefer edit for targeted changes and use write when creating a file or replacing the full file content intentionally.',
    'Stop using tools as soon as you have enough context to answer or make the requested change.',
    'Do not explore for reassurance. Only inspect the next file or directory when the current evidence creates a concrete reason to do so.',
    'If a tool fails, inspect the returned error details, correct the tool call, and retry instead of giving up or fabricating a result.',
    `Every absolute_path must stay inside this locked root directory: ${agentContextRootPath}`,
  ])
}
