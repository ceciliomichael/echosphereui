const TOOL_DESCRIPTIONS = {
  todo_write: `Track task progress with a concise list.

Usage guidelines:
- Call this only when explicit task tracking helps on genuinely larger, branching, or uncertain work.
- Skip it for small or linear tasks.
- Optional \`sessionKey\`: short session key for the current todo list.
- Required \`tasks\`: ordered objects with \`id\`, \`content\`, and \`status\`.
- Status rules: keep exactly one \`in_progress\` task in normal flow; other items should be \`pending\` or \`completed\`.
- Keep task ids stable across updates so progress tracking stays consistent.
- Do not resend an identical \`tasks\` array; execute work first, then update statuses.
- Anchor updates to real progress: call \`todo_write\` after completing work, starting a new concrete step, or changing task status for a substantive reason.
- Do not call \`todo_write\` every turn. If no task status changed, continue execution without this tool.
- Prefer one high-signal update after a meaningful chunk of work rather than many micro-updates.
- Payload template: \`{"sessionKey":"default","tasks":[{"id":"inspect","content":"Inspect files","status":"in_progress"},{"id":"edit","content":"Apply edits","status":"pending"}]}\`.`,
  ready_implement: `Ask for explicit user approval before implementation begins.

Usage guidelines:
- Call this only after presenting the implementation plan and updating todo tasks via \`todo_write\`.
- Ask at decision boundaries, not repeatedly.
- If the user already approved and scope is unchanged, continue execution without calling this again.
- Optional fields: \`prompt\`, \`yes_label\`, and \`no_label\`.
- The tool renders a user-facing choice gate and waits for user decision.
- If the user chooses yes, continue in Agent mode and implement the approved plan.
- If the user chooses no, refine the plan based on feedback and call this again after updating the plan.`,
  ask_question: `Ask the user a focused planning question with predefined answer options.

Usage guidelines:
- Use only when missing user input materially affects correctness, scope, or architecture.
- Do not ask for information that can be discovered via read/list/glob/grep.
- Ask one question per call and avoid bundling unrelated decisions.
- Provide \`question\` as a concise planning question.
- Provide \`options\` with 2 or 3 choices (each with \`id\` and \`label\`).
- \`options\` is required; each option must be an object like \`{"id":"option_a","label":"Option A"}\`.
- Valid payload example: \`{"question":"Which layout should we use?","options":[{"id":"keep","label":"Keep existing layout"},{"id":"new","label":"Add a new section"}],"allow_custom_answer":true}\`.
- Optional \`allow_custom_answer\` controls whether free-form user input is allowed (default: true).
- If the user already answered the same decision, do not ask again unless constraints changed.`,
  list: `List files and directories at an absolute path inside the workspace root.

Usage guidelines:
- Use this for directory discovery, not file content.
- Avoid repetitive listing of the same unchanged directory; reuse recent results unless you need refresh after edits.
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
- Read only what is needed for the next decision or edit.
- Avoid re-reading the same file range if no relevant change occurred since the previous read.
- Prefer targeted ranges with \`start_line\` and \`end_line\`; avoid full-file reads when only a section is needed.
- Provide \`absolute_path\` as an absolute file path and keep every directory segment exactly as written.
- If the file lives in \`src/app/components/component-name.tsx\`, pass that full path exactly; do not drop intermediate folders such as \`components\`.
- Use \`start_line\` and \`end_line\` for explicit inclusive ranges.
- Use \`max_lines\` to cap output when line ranges are broad.
- If more lines exist, call again with \`nextStartLine\` or a higher \`start_line\`.
- Use \`grep\` to locate relevant sections first in large files.`,
  glob: `Find file paths by glob pattern inside the workspace using ripgrep.

Usage guidelines:
- Use for path discovery when you do not yet know exact file names.
- Avoid broad repeated scans with the same pattern and root; refine \`pattern\` or narrow \`absolute_path\` first.
- Provide \`absolute_path\` as an absolute file or directory search root.
- Use an existing root from prior tool output (typically \`<cwd>\` or a previously listed subdirectory).
- Provide \`pattern\` as a glob expression (for example \`**/*.ts\`).
- Use \`max_results\` to limit returned matches for large trees.
- Results exclude gitignored entries unless they are always-visible metadata files.
- Use this to discover candidate files before \`read\` or \`edit\`.`,
  grep: `Search file contents by pattern inside the workspace using ripgrep.

Usage guidelines:
- Use this to locate exact sections before \`read\` or \`edit\`, not as a substitute for reading context.
- Prefer precise patterns and narrow roots to reduce noisy results.
- Avoid repeating the same broad grep without changing pattern, path, or case mode.
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
- Keep edits surgical: change only necessary lines and avoid unrelated formatting churn.
- If multiple matches exist, make \`old_string\` more specific or set \`replace_all: true\`.
- Matching is resilient to line endings, indentation shifts, whitespace differences, and escaped text.
- For creating a new file with replace mode, use \`old_string: ""\` and \`new_string\` with the full file content.
- Use \`write\` when you already know the full final file content.
- For multiple files, issue multiple edit tool calls; path-exclusive scheduling allows safe parallelism.`,
  write: `Write or overwrite a file at an absolute path inside the workspace root.

Usage guidelines:
- Use this only when you already know the complete final content.
- Do not use \`write\` for small targeted changes; prefer \`edit\` to avoid rewriting unchanged code.
- Provide \`absolute_path\` as an absolute file path.
- Provide \`content\` as the full target file contents.
- Existing files are overwritten in full.
- Use \`write\` when you already know the complete final file content.
- Use \`edit\` for targeted anchored replacements.`,
  exec_command: `Run a shell command in a managed terminal session and return output.

Usage guidelines:
- Use terminal commands when they materially improve correctness (tests, type checks, build, diagnostics), not by default for every step.
- Avoid redundant commands whose result is already known from earlier tool output.
- Prefer concise, deterministic, non-interactive commands.
- \`cmd\` is required and should be a complete shell command string.
- Use \`workdir\` to change the execution directory (relative paths resolve from workspace root).
- Use \`yield_time_ms\` to wait longer for output before returning.
- If the process is still running, use \`write_stdin\` with the returned \`processId\` as \`session_id\`.
- Keep commands scoped to the workspace and prefer non-interactive commands.`,
  write_stdin: `Write input to an existing terminal session and return the latest output.

Usage guidelines:
- Use this only for an active session created by \`exec_command\`.
- Prefer polling with empty \`chars\` for long-running jobs instead of sending unnecessary input.
- Stop polling once the command has exited.
- Provide \`session_id\` from a prior \`exec_command\` response.
- Provide \`chars\` to send bytes to stdin.
- Send an empty \`chars\` string to poll output without new input.
- Use \`yield_time_ms\` and \`max_output_tokens\` to control output size and wait time.
- Repeat calls while \`commandRunning\` is true.`,
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

const GLOBAL_TOOL_CONTRACT = `Global tool contract:
- Treat tool outputs as source of truth. Do not fabricate command results, file contents, or execution outcomes.
- Prefer inspect-first flow: discover with list/glob/grep, read exact context, then mutate with edit/write.
- Use absolute paths exactly as provided by prior tool results whenever possible; avoid guessing shortened paths.
- Keep tool calls minimal but sufficient for correctness. If evidence is missing, call another tool instead of assuming.
- No wasted calls: do not repeat the same tool call with materially identical arguments unless new state justifies re-running.
- Before each call, ask: what new evidence or state transition will this call produce?
- If a tool fails, surface the failure and recover with the next best concrete action.`

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return `${GLOBAL_TOOL_CONTRACT}\n\n${TOOL_DESCRIPTIONS[name]}`
}
