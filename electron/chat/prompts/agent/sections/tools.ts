import { formatSection } from './formatSection'

export function buildAgentToolsSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  if (!supportsNativeTools) {
    return formatSection('Tools', [
      `Your working directory is locked to this absolute path: ${agentContextRootPath}`,
      'You do not have native tools in this environment, so give grounded guidance based on the locked root context and the user request.',
    ])
  }

  return formatSection('Tools', [
    'You have native tools: list, read, glob, grep, write, edit, exec_command, and write_stdin.',
    'Use list to inspect directories, read to inspect files, glob to match file paths, grep to search file contents, write to create or fully replace files, edit to apply structured patches, exec_command to run terminal commands, and write_stdin to continue an active terminal session.',
    'List the locked root once only when structure is unknown, then work on specific paths.',
    'Use glob or grep to narrow targets before read; avoid broad scanning.',
    'Use read only for the exact file and line range needed.',
    'When read returns partial coverage, continue with a new range instead of repeating the same call.',
    'Prefer read before edit only when the current file content is genuinely unknown.',
    'Prefer edit for targeted changes and use write when creating a file or replacing the full file content intentionally.',
    'Do not issue multiple write or edit calls for the same path in one response. Wait for the first result, then decide the next step from that updated workspace state.',
    'Never invoke apply_patch through exec_command. Use the edit tool for patch-based edits.',
    'Use write_stdin only with a session_id returned by exec_command.',
    'Use read metadata fields (start/end, lineCount, totalLineCount, hasMoreLines, next_start_line, next_end_line) for continuation decisions.',
    'Stop using tools as soon as you have enough context to answer or make the requested change.',
    'Do not explore for reassurance. Only inspect the next file or directory when the current evidence creates a concrete reason to do so.',
    'If a tool fails, inspect the returned error details, correct the tool call, and retry instead of giving up or fabricating a result.',
    `Every absolute_path must stay inside this locked root directory: ${agentContextRootPath}`,
  ])
}
