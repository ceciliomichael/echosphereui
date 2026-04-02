const TOOL_DESCRIPTIONS = {
  ready_implement:
    'Use this when you need an explicit yes/no implementation gate from the user before proceeding.',
  ask_question:
    'Use this when you need the user to choose from 2-3 planning options before implementation.',
  list: 'Use this when you need a directory tree view of files and folders inside the workspace.',
  read:
    'Use this when you need current file content for context. Read returns line-prefixed content to improve follow-up edits.',
  glob: 'Use this when you need to discover file paths by wildcard pattern matching.',
  grep: 'Use this when you need to find content matches in files by text or regex pattern.',
  apply_patch:
    'Use this only for legacy patch-style updates to existing files. It supports Update File hunks only and does not support Add/Delete/Move.',
  edit:
    'Use this for most file modifications and targeted replacements. Supports old_string/new_string anchored edits, numbered-read prefix tolerance, and optional start_line/end_line constraints.',
  write: 'Use this when you need to create or fully overwrite a file with known final content.',
  run_terminal: 'Use this when you need to execute a shell command in a managed terminal session.',
  get_terminal_output: 'Use this when you need to read additional output from an existing terminal session.',
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return TOOL_DESCRIPTIONS[name]
}
