const TOOL_DESCRIPTIONS = {
  todo_write: 'Track task progress with a concise list.',
  ready_implement: 'Ask for user approval before implementation begins.',
  ask_question: 'Ask the user a focused planning question with answer options.',
  list: 'List files and directories in the workspace.',
  read: 'Read text file contents from the workspace.',
  glob: 'Find file paths by glob pattern inside the workspace.',
  grep: 'Search file contents by pattern inside the workspace.',
  edit: 'Edit files in the workspace.',
  write: 'Write or overwrite a file in the workspace.',
  run_terminal: 'Run a shell command in a managed terminal session.',
  get_terminal_output: 'Read output from an existing terminal session.',
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

const GLOBAL_TOOL_CONTRACT = `Global tool contract:
- Treat tool outputs as source of truth. Do not fabricate command results, file contents, or execution outcomes.
- Prefer inspect-first flow: discover with list/glob/grep, read exact context, then proceed with needed changes.
- Use absolute paths exactly as provided by prior tool results whenever possible; avoid guessing shortened paths.
- Keep tool calls minimal but sufficient for correctness. If evidence is missing, call another tool instead of assuming.
- No wasted calls: do not repeat the same tool call with materially identical arguments unless new state justifies re-running.
- Before each call, ask: what new evidence or state transition will this call produce?
- Never compress or summarize large diffs, file reads, or other exact workspace state that the next step depends on.
- When writing or editing source files, preserve the intended multiline structure and indentation exactly. Do not collapse code into a single line, and do not strip blank lines that are part of the file's shape.
- Only repetitive terminal polling and similarly low-value command noise should be compacted.
- If a tool fails, surface the failure and recover with the next best concrete action.`

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return `${GLOBAL_TOOL_CONTRACT}\n\n${TOOL_DESCRIPTIONS[name]}`
}
