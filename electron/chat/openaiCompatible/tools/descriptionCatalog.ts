const TOOL_DESCRIPTIONS = {
  todo_write: 'Track task progress with a concise list.',
  ready_implement: 'Ask for user approval before implementation begins.',
  ask_question: 'Ask the user a focused planning question with answer options.',
  list: 'List files and directories in the workspace.',
  read: 'Read text file contents from the workspace. Read only if the file is already outdated in your historical context or you cannot calculate your changes, do not over-read the same file just for the sake of it.',
  glob: 'Find file paths by glob pattern inside the workspace.',
  grep: 'Search file contents by pattern inside the workspace.',
  edit: 'Edit files in the workspace. After you edit, do not read the file back; assume and trust that the edit was successful and based on that new state.',
  write: 'Write or overwrite a file in the workspace. After writing, do not read the file back; assume and trust that the write was successful and based on that new state.',
  run_terminal: 'Run a shell command in a managed terminal session.',
  get_terminal_output: 'Read output from an existing terminal session.',
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

const GLOBAL_TOOL_CONTRACT = `Global tool contract:
- Treat tool outputs as source of truth. Do not fabricate command results, file contents, or execution outcomes.
- Make sure that tool usage is purposeful and necessary; avoid redundant or speculative calls.
- When a tool requires a path, send a real absolute filesystem path rooted in the workspace. Do not emit pseudo tool calls in plain text.
- Always use the tools available to you to your fullest advantage. Use them wisely, strategically until you finish the task at hand.`

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return `${GLOBAL_TOOL_CONTRACT}\n\n${TOOL_DESCRIPTIONS[name]}`
}
