const TOOL_DESCRIPTIONS = {
  update_plan: `Create or update the active execution plan for this run.

Usage guidelines:
- Call this at the start of substantial multi-step work, then only when plan status changes.
- Optional \`plan\`: short plan title.
- Required \`steps\`: ordered objects with \`id\`, \`title\`, and \`status\`.
- Status rules: exactly one \`in_progress\` while work remains; remaining items should be \`pending\` or \`completed\`.
- Keep step ids stable across updates so progress tracking stays consistent.`,
  list: `List files and directories at an absolute path inside the workspace root.

Usage guidelines:
- Provide \`absolute_path\` as an absolute directory path.
- Use \`limit\` to cap returned entries when listing large directories.
- Results are sorted and filtered to hide gitignored entries by default.
- Use this before \`read\` when you need to discover exact file names.`,
  read: `Read text file contents from an absolute path inside the workspace root.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file path.
- Use \`start_line\` and \`end_line\` for explicit inclusive ranges.
- Use \`max_lines\` to cap output when line ranges are broad.
- If more lines exist, call again with \`nextStartLine\` or a higher \`start_line\`.
- Use \`grep\` to locate relevant sections first in large files.`,
  glob: `Find file paths by glob pattern inside the workspace using ripgrep.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file or directory search root.
- Provide \`pattern\` as a glob expression (for example \`**/*.ts\`).
- Use \`max_results\` to limit returned matches for large trees.
- Results exclude gitignored entries unless they are always-visible metadata files.
- Use this to discover candidate files before \`read\` or \`edit\`.`,
  grep: `Search file contents by pattern inside the workspace using ripgrep.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file or directory search root.
- Provide \`pattern\` as a fixed string by default; set \`is_regex\` for regex mode.
- Use \`case_sensitive\` when exact casing matters.
- Use \`max_results\` to constrain very broad searches.
- Use returned file paths and line numbers with \`read\` for follow-up context.`,
  edit: `Edit files with robust anchored replacements under the workspace root.

Usage guidelines:
- Provide one edit operation per call with \`absolute_path\`.
- Replace mode: provide \`old_string\` and \`new_string\` (optional \`replace_all\`).
- Full-write mode: provide \`content\` to set the entire file content.
- Use \`read\` first so \`old_string\` includes enough context to uniquely match.
- If multiple matches exist, make \`old_string\` more specific or set \`replace_all: true\`.
- Matching is resilient to line endings, indentation shifts, whitespace differences, and escaped text.
- For creating a new file with replace mode, use \`old_string: ""\` and \`new_string\` with the full file content.
- For multiple files, issue multiple edit tool calls; path-exclusive scheduling allows safe parallelism.`,
  write: `Write or overwrite a file at an absolute path inside the workspace root.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file path.
- Provide \`content\` as the full target file contents.
- Existing files are overwritten in full.
- Use \`write\` when you already know the complete final file content.
- Use \`edit\` for targeted anchored replacements.`,
  exec_command: `Run a shell command in a managed terminal session and return output.

Usage guidelines:
- \`cmd\` is required and should be a complete shell command string.
- Use \`workdir\` to change the execution directory (relative paths resolve from workspace root).
- Use \`yield_time_ms\` to wait longer for output before returning.
- If the process is still running, use \`write_stdin\` with the returned \`processId\` as \`session_id\`.
- Keep commands scoped to the workspace and prefer non-interactive commands.`,
  write_stdin: `Write input to an existing terminal session and return the latest output.

Usage guidelines:
- Provide \`session_id\` from a prior \`exec_command\` response.
- Provide \`chars\` to send bytes to stdin.
- Send an empty \`chars\` string to poll output without new input.
- Use \`yield_time_ms\` and \`max_output_tokens\` to control output size and wait time.
- Repeat calls while \`commandRunning\` is true.`,
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return TOOL_DESCRIPTIONS[name]
}
