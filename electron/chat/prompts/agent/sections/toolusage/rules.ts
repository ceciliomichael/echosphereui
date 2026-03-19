export const TOOL_USAGE_RULES: ReadonlyArray<{ description: string; toolName: string; rules: readonly string[] }> = [
  {
    description: 'Track and update execution workflow state for the current run.',
    toolName: 'update_plan',
    rules: [
      'For substantial multi-step work, call update_plan before making code changes.',
      'Use in_progress for active work; multiple in_progress steps are allowed when work happens in parallel.',
      'Keep step ids stable across updates and only change statuses when progress actually changes.',
      'Do not call update_plan with an unchanged step list; continue execution first.',
      'Update step statuses as work completes; do not mark completed prematurely.',
      'When all steps are complete, update_plan should reflect no remaining incomplete steps.',
    ],
  },
  {
    description: 'Inspect directories before opening or mutating files.',
    toolName: 'list',
    rules: [
      'Use absolute_path rooted in the workspace.',
      'Never pass bare nested folder names (for example "app") without the parent path.',
      'Build child paths from the last successful path (for example <cwd>/src -> <cwd>/src/app).',
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
      'Use glob to discover candidate files before read or edit.',
      'Set absolute_path to a real existing directory path, usually <cwd> or a listed subdirectory.',
      'Constrain broad searches with max_results.',
    ],
  },
  {
    description: 'Find content matches with ripgrep semantics.',
    toolName: 'grep',
    rules: [
      'Set absolute_path to a real existing directory or file path, usually <cwd> or a listed subdirectory.',
      'Set is_regex only when regex matching is required.',
      'Use returned file paths and line numbers with read for context.',
    ],
  },
  {
    description: 'Write full file contents in one operation.',
    toolName: 'write',
    rules: [
      'Use write when you know the complete final content for a file.',
      'Provide absolute_path and full content.',
      'Write replaces the file content entirely.',
      'If only part of a file should change, prefer edit.',
    ],
  },
  {
    description: 'Apply robust, context-anchored targeted edits.',
    toolName: 'edit',
    rules: [
      'Use edit for targeted mutations where only part of a file should change.',
      'Edit payload shape: { "absolute_path": "...", ... }.',
      'Replace operation: include old_string + new_string (+ optional replace_all).',
      'Do not send content in edit; use write for full-file writes.',
      'When old_string is non-empty, read the file first and provide enough surrounding context for uniqueness.',
      'If the tool reports multiple matches, expand old_string context or set replace_all: true.',
      'For new files in replace mode, set old_string to an empty string and put full file text in new_string.',
      'For multiple files, issue multiple edit calls (parallel calls are allowed across different paths).',
      'Never emit pseudo tool calls in plain text (for example edit:{...}); always invoke the tool directly.',
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
