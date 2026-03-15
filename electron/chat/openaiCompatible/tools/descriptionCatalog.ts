const TOOL_DESCRIPTIONS = {
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
- Use this to discover candidate files before \`read\` or \`patch\`.`,
  grep: `Search file contents by pattern inside the workspace using ripgrep.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file or directory search root.
- Provide \`pattern\` as a fixed string by default; set \`is_regex\` for regex mode.
- Use \`case_sensitive\` when exact casing matters.
- Use \`max_results\` to constrain very broad searches.
- Use returned file paths and line numbers with \`read\` for follow-up context.`,
  patch: `Apply structured file edits with a patch envelope under the workspace root.

Usage guidelines:
- The patch must start with \`*** Begin Patch\` and end with \`*** End Patch\`.
- Supported hunks: \`*** Add File:\`, \`*** Update File:\`, \`*** Delete File:\`, optional \`*** Move to:\`.
- In an \`*** Update File:\` hunk, every change line must start with exactly one prefix: space (\` \`), plus (\`+\`), or minus (\`-\`).
- Never include raw/unprefixed lines inside update hunks.
- Patch preflight: before calling patch, verify each Update File hunk line begins with space/+/-. 
- Empty lines are allowed only when prefixed (for example a blank added line is just \`+\`).
- If you are inserting a line without deleting/replacing existing lines, prefix it with \`+\`.
- If a line is unchanged context, prefix it with a leading space.
- Send only patch text in the patch argument; do not include markdown fences or narrative text.
- Do not include markdown fences, explanations, or unified-diff headers like \`@@ -1,3 +1,3 @@\`.
- Use context markers as \`@@\` or \`@@ optional context text\`.
- Prefer precise hunks that target the smallest necessary change.
- Use \`read\` before patching to confirm context and avoid mismatches.

Valid update hunk example:
\`\`\`
*** Begin Patch
*** Update File: src/app.ts
@@
-const version = 1
+const version = 2
*** End Patch
\`\`\`

Invalid update hunk example (will fail):
\`\`\`
*** Begin Patch
*** Update File: src/app.ts
@@
const version = 2
*** End Patch
\`\`\``,
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
  write: `Write or overwrite a file at an absolute path inside the workspace root.

Usage guidelines:
- Provide \`absolute_path\` as an absolute file path.
- Provide \`content\` as the full target file contents.
- Existing files are overwritten in full; this tool does not apply partial edits.
- Prefer \`patch\` for targeted modifications to existing files.
- Use \`read\` before writing when preserving unrelated content matters.`,
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return TOOL_DESCRIPTIONS[name]
}
