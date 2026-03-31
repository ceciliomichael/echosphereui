const TOOL_DESCRIPTIONS = {
  ready_implement: 'Request implementation approval.',
  ask_question: 'Ask a planning question with answer options.',
  list: 'List files and directories in the workspace.',
  read: 'Read file contents from the workspace.',
  glob: 'Find file paths by glob pattern.',
  grep: 'Search file contents by pattern.',
  apply_patch: `Edit an existing workspace file using the *** Begin Patch / *** End Patch format. File paths may be relative to the workspace root or absolute paths inside the workspace. Only Update File hunks are supported. Always read before you edit.

How to write a reliable hunk
- Copy the exact current file text from the workspace.
- Include 3 to 8 surrounding lines that uniquely identify the spot.
- Avoid generic anchors like "import {" or "function".
- Keep quotes, semicolons, indentation, and line breaks exactly as they exist now.

Example:
*** Begin Patch
*** Update File: src/example.ts
@@
 function greet(name: string) {
-  return "hello"
+  return "hi"
 }
*** End Patch`,
  edit: 'Edit files in the workspace.',
  write: 'Write or overwrite a file in the workspace.',
  run_terminal: 'Run a shell command in a managed terminal session.',
  get_terminal_output: 'Read output from an existing terminal session.',
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return TOOL_DESCRIPTIONS[name]
}
