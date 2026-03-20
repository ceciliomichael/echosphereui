const TOOL_DESCRIPTIONS = {
  update_plan: `Create or update the active execution plan for this run.

Usage guidelines:
- Call this only when explicit step tracking would help on genuinely larger, branching, or uncertain work.
- Skip it for small or linear tasks.
- Optional \`plan\`: short plan title.
- Required \`steps\`: ordered objects with \`id\`, \`title\`, and \`status\`.
- Status rules: use \`in_progress\` for active work (multiple steps are allowed); other items should be \`pending\` or \`completed\`.
- Keep step ids stable across updates so progress tracking stays consistent.
- Do not resend an identical \`steps\` array; execute work first, then update statuses.
- Payload template: \`{"plan":"default","steps":[{"id":"inspect","title":"Inspect files","status":"in_progress"},{"id":"edit","title":"Apply edits","status":"pending"}]}\`.`,
  ready_implement: `Ask for explicit user approval before implementation begins.

Usage guidelines:
- Call this only after presenting the implementation plan and updating plan steps via \`update_plan\`.
- Optional fields: \`prompt\`, \`yes_label\`, and \`no_label\`.
- The tool renders a user-facing choice gate and waits for user decision.
- If the user chooses yes, continue in Agent mode and implement the approved plan.
- If the user chooses no, refine the plan based on feedback and call this again after updating the plan.`,
  ask_question: `Ask the user a focused planning question with predefined answer options.

Usage guidelines:
- Provide \`question\` as a concise planning question.
- Provide \`options\` with 2 or 3 choices (each with \`id\` and \`label\`).
- \`options\` is required; each option must be an object like \`{"id":"option_a","label":"Option A"}\`.
- Valid payload example: \`{"question":"Which layout should we use?","options":[{"id":"keep","label":"Keep existing layout"},{"id":"new","label":"Add a new section"}],"allow_custom_answer":true}\`.
- Optional \`allow_custom_answer\` controls whether free-form user input is allowed (default: true).
- Use this only when a missing decision materially affects implementation correctness or scope.
- Ask one question per call and avoid bundling unrelated decisions.`,
  list: `List files and directories at an absolute path inside the workspace root.

Usage guidelines:
- Provide \`absolute_path\` as an absolute directory path and keep every path segment exactly as written.
- Do not collapse or rewrite nested folders. If the target is \`<cwd>/src/app/components\`, pass that full directory path, not \`<cwd>/src/components\`, \`<cwd>/path/app\`, or any shortened variant.
- Path chaining rule: if \`<cwd>/src\` succeeded, list child folders as \`<cwd>/src/app\` (not just \`app\`), and then \`<cwd>/src/app/components\` (not \`components\` alone).
- The returned result includes \`absolutePath\` for the resolved full directory path, while \`path\` remains the UI display path.
- Use \`limit\` to cap returned entries when listing large directories.
- Results are sorted and filtered to hide gitignored entries by default.
- The system prompt may include only a folder tree for context; use \`list\` to discover exact file names before \`read\`, \`edit\`, or \`write\`.
- Do not assume file-level details from folder-only context.`,
  read: `Read text file contents from an absolute path inside the workspace root.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file path and keep every directory segment exactly as written.
- If the file lives in \`src/app/components/component-name.tsx\`, pass that full path exactly; do not drop intermediate folders such as \`components\`.
- Use \`start_line\` and \`end_line\` for explicit inclusive ranges.
- Use \`max_lines\` to cap output when line ranges are broad.
- If more lines exist, call again with \`nextStartLine\` or a higher \`start_line\`.
- Use \`grep\` to locate relevant sections first in large files.`,
  glob: `Find file paths by glob pattern inside the workspace using ripgrep.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file or directory search root.
- Use an existing root from prior tool output (typically \`<cwd>\` or a previously listed subdirectory).
- Provide \`pattern\` as a glob expression (for example \`**/*.ts\`).
- Use \`max_results\` to limit returned matches for large trees.
- Results exclude gitignored entries unless they are always-visible metadata files.
- Use this to discover candidate files before \`read\` or \`edit\`.`,
  grep: `Search file contents by pattern inside the workspace using ripgrep.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file or directory search root.
- Use an existing root from prior tool output (typically \`<cwd>\` or a previously listed subdirectory).
- Provide \`pattern\` as a fixed string by default; set \`is_regex\` for regex mode.
- Use \`case_sensitive\` when exact casing matters.
- Use \`max_results\` to constrain very broad searches.
- Use returned file paths and line numbers with \`read\` for follow-up context.`,
  edit: `Edit files with robust anchored replacements under the workspace root.

Usage guidelines:
- Provide one edit operation per call with \`absolute_path\`.
- Replace mode: provide \`old_string\` and \`new_string\` (optional \`replace_all\`).
- Use \`read\` first so \`old_string\` includes enough context to uniquely match.
- If multiple matches exist, make \`old_string\` more specific or set \`replace_all: true\`.
- Matching is resilient to line endings, indentation shifts, whitespace differences, and escaped text.
- For creating a new file with replace mode, use \`old_string: ""\` and \`new_string\` with the full file content.
- Use \`write\` when you already know the full final file content.
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
