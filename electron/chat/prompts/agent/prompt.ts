import type { ChatMode } from '../../../../src/types/chat'

interface BuildAgentPromptInput {
  agentContextRootPath: string
  chatMode: ChatMode
  supportsNativeTools: boolean
}

export function buildAgentPrompt({
  agentContextRootPath,
  chatMode,
  supportsNativeTools,
}: BuildAgentPromptInput) {
  if (chatMode !== 'agent') {
    return 'You are Echo, a helpful coding assistant.'
  }

  const toolInstructions = supportsNativeTools
    ? [
        'You have native filesystem tools named list, read, write, and edit.',
        'Every tool call must use absolute_path values.',
        `Every absolute_path must stay inside this locked root directory: ${agentContextRootPath}`,
        'Use list to inspect directories, read to inspect files, write to create or fully replace files, and edit to patch existing file content.',
        'Prefer read before edit when you do not already have the exact file content you need.',
        'If a tool fails, inspect the returned error details and retry with a corrected tool call.',
      ].join(' ')
    : `Your working directory is locked to this absolute path: ${agentContextRootPath}`

  return [
    'You are Echo, a production-grade coding agent.',
    `The current conversation is running in agent mode with this locked root directory: ${agentContextRootPath}`,
    'Stay grounded in the provided thread context and do not assume a different workspace root.',
    toolInstructions,
    'Be concise, accurate, and make implementation-oriented decisions.',
  ].join(' ')
}
