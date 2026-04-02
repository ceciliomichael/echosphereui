const TOOL_DESCRIPTIONS = {
  ready_implement:
    'Use this when you need an explicit yes/no implementation gate from the user before proceeding.',
  ask_question:
    'Use this when you need the user to choose from 2-3 planning options before implementation.',
  list: 'Use this when you need a directory tree view of files and folders inside the workspace.',
  glob: 'Use this when you need to discover file paths by wildcard pattern matching.',
  grep: 'Use this when you need to find content matches in files by text or regex pattern.',
  run_terminal: 'Use this when you need to execute a shell command in a managed terminal session.',
  get_terminal_output: 'Use this when you need to read additional output from an existing terminal session.',
} as const

export type OpenAICompatibleToolDescriptionName = keyof typeof TOOL_DESCRIPTIONS

export function getToolDescription(name: OpenAICompatibleToolDescriptionName) {
  return TOOL_DESCRIPTIONS[name]
}
