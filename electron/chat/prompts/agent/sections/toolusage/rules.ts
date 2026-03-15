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
    description: 'Apply precise line-level changes while keeping diffs reviewable.',
    toolName: 'patch',
    rules: [
      'Why: use patch to make minimal, auditable edits instead of rewriting full files.',
      'When: prefer patch for targeted updates where most of the file stays unchanged.',
      'If the file has not been read in this conversation, read it first to confirm exact context before patching.',
      'If the change is a full rewrite or generated content replacement, use write instead of patch.',
      'Format: patch text must start with *** Begin Patch and end with *** End Patch.',
      'Format: for updates, use *** Update File: <path> then @@ sections with context.',
      'Format: inside update hunks, every line must begin with exactly one prefix: space (context), + (add), or - (remove).',
      'Format: never include raw/unprefixed lines, markdown fences, narrative text, or unified-diff headers.',
      'Example (valid minimal patch): *** Begin Patch | *** Update File: path/to/file.ts | @@ | - old line | + new line | *** End Patch',
      'Preflight: verify file paths are correct and each hunk can be applied cleanly to current file contents.',
    ],
  },
  {
    description: 'Write full file contents in one operation.',
    toolName: 'write',
    rules: [
      'Why: use write when replacing an entire file is clearer and safer than constructing many patch hunks.',
      'When: use write for new files, full rewrites, or generated outputs that should be replaced atomically.',
      'If only a small region changes, prefer patch/edit to preserve history and reduce accidental deletions.',
      'If writing an existing file, provide the complete final content, not partial snippets.',
      'If uncertain about current contents, read first before write to avoid clobbering unrelated changes.',
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
