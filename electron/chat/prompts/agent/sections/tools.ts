import { formatSection } from './formatSection'

export function buildAgentToolsSection(agentContextRootPath: string, supportsNativeTools: boolean) {
  if (!supportsNativeTools) {
    return formatSection('Tools', [
      `Your working directory is locked to this absolute path: ${agentContextRootPath}`,
      'You do not have native tools in this environment, so give grounded guidance based on the locked root context and the user request.',
    ])
  }

  return formatSection('Tools', [
    'You have native tools: list, read, glob, grep, patch, exec_command, and write_stdin.',
    'Use list to inspect directories, read to inspect files, glob to match file paths, grep to search file contents, patch to apply structured add/update/delete/move file patches, exec_command to run terminal commands, and write_stdin to continue an active terminal session.',
    'List the locked root once only when structure is unknown, then work on specific paths.',
    'Use glob or grep to narrow targets before read; avoid broad scanning.',
    'Do not repeat list/glob/grep/read calls with identical arguments unless previous output is stale or incomplete.',
    'Use read only for the exact file and line range needed.',
    'For read with start_line/end_line, ranges are inclusive and should target at most 500 lines per call.',
    'When read returns partial coverage, continue with a new range instead of repeating the same call.',
    'For continuation reads, prefer the returned next_start_line and next_end_line metadata instead of manually guessing line bounds.',
    'Treat each successful read as cached context until invalidated by a patch/exec mutation, partial coverage, or newly discovered dependency.',
    'Prefer read before patch only when the current file content is genuinely unknown.',
    'Use patch for targeted and full-file updates, including creating files via Add File hunks.',
    'Do not issue multiple patch calls for the same path in one response. Wait for the first result, then decide the next step from that updated workspace state.',
    'Never invoke apply_patch through exec_command. Use the patch tool for patch-based edits.',
    'Use write_stdin only with a session_id returned by exec_command.',
    'Use read metadata fields (start/end, lineCount, totalLineCount, hasMoreLines, next_start_line, next_end_line) for continuation decisions.',
    'Stop using tools as soon as you have enough context to answer or make the requested change.',
    'Do not explore for reassurance. Only inspect the next file or directory when the current evidence creates a concrete reason to do so.',
    'If you are looping on inspection, stop and act on the best-supported implementation, then verify results instead of rereading unchanged context.',
    'If a tool fails, inspect the returned error details, correct the tool call, and retry instead of giving up or fabricating a result.',
    `Every absolute_path must stay inside this locked root directory: ${agentContextRootPath}`,
  ])
}
