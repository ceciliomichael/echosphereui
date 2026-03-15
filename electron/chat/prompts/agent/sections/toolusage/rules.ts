export const TOOL_USAGE_RULES: ReadonlyArray<{ description: string; toolName: string; rules: readonly string[] }> = [
  {
    description: 'Inspect directories before opening or mutating files.',
    toolName: 'list',
    rules: [
      'Use absolute_path rooted in the workspace.',
      'Use limit to keep large listings focused.',
    ],
  },
  {
    description: 'Read file content in bounded windows.',
    toolName: 'read',
    rules: [
      'Use start_line/end_line for targeted ranges.',
      'Prefer larger, meaningful slices over many tiny reads.',
    ],
  },
  {
    description: 'Locate files by glob pattern.',
    toolName: 'glob',
    rules: [
      'Use glob to discover candidate files before read or patch.',
      'Constrain broad searches with max_results.',
    ],
  },
  {
    description: 'Find content matches with ripgrep semantics.',
    toolName: 'grep',
    rules: [
      'Set is_regex only when regex matching is required.',
      'Use returned file paths and line numbers with read for context.',
    ],
  },
  {
    description: 'Apply structured multi-file edits safely.',
    toolName: 'patch',
    rules: [
      'Patch must start with *** Begin Patch and end with *** End Patch.',
      'Update hunks: every line must start with exactly one prefix: space, +, or -.',
      'Never place raw/unprefixed lines inside Update File hunks.',
      'Patch preflight: before calling patch, verify each Update File hunk line begins with space/+/-.',
      'If you are inserting a line without deleting/replacing existing lines, prefix it with +.',
      'If a line is unchanged context, prefix it with a leading space.',
      'Send only patch text in the patch argument; do not include markdown fences or narrative text.',
      'Do not include markdown fences, commentary, or unified-diff headers in patch text.',
    ],
  },
  {
    description: 'Write full file contents in one operation.',
    toolName: 'write',
    rules: [
      'Use write for full rewrites; use patch for targeted edits.',
      'Always provide complete intended file content, not partial snippets.',
    ],
  },
  {
    description: 'Run shell commands in managed terminal sessions.',
    toolName: 'exec_command',
    rules: [
      'Use non-interactive commands when possible.',
      'Prefer workspace-scoped commands and explicit workdir when needed.',
    ],
  },
  {
    description: 'Continue or poll an existing terminal session.',
    toolName: 'write_stdin',
    rules: [
      'Use session_id from exec_command responses.',
      'Use empty chars to poll output without sending new input.',
    ],
  },
]
