import { formatSection } from './formatSection'

export function buildAgentToolsSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  if (!supportsNativeTools) {
    return formatSection('Tools', [
      `Your working directory is locked to this absolute path: ${agentContextRootPath}`,
      'Native tools are not available in this run. Give grounded guidance from this locked root and the user request.',
    ])
  }

  return formatSection('Tools', [
    'Available tools: list, read, glob, grep, patch, exec_command, write_stdin.',
    'Use list for directories, read for file content, glob/grep to narrow targets, patch to edit files, exec_command for shell commands, write_stdin for active shell sessions.',
    'List root once only when needed, then move to exact paths.',
    'Use glob/grep before read when you need to find targets.',
    'Do not repeat the same list/glob/grep/read call unless prior output is stale or partial.',
    'Read only the needed file and line range.',
    'For read with start_line/end_line: ranges are inclusive, max 500 lines per call.',
    'If read is partial, continue with next range. Do not repeat the same range.',
    'Use returned read metadata for continuation, especially next_start_line and next_end_line.',
    'Never reread the same unchanged range just to verify or feel safe.',
    'After a successful patch, trust the patch result. Read again only if you need new unknown content.',
    'Use patch for focused edits and full-file updates, including Add File hunks.',
    'Do not call patch multiple times for the same path in one response.',
    'Do not call apply_patch via exec_command.',
    'Use write_stdin only with a session_id from exec_command.',
    'Stop tooling when context is enough to answer or implement.',
    'If you start looping on reads, stop and implement with current evidence.',
    'If a tool fails, inspect error details, fix arguments, and retry.',
    `Every absolute_path must stay inside this locked root directory: ${agentContextRootPath}`,
  ])
}
