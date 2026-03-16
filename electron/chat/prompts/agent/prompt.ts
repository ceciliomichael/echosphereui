import { buildAgentIdentitySection } from './sections/identity'
import { buildToolUsageSection } from './sections/toolusage'
import { buildWorkflowSection } from './sections/workflow'
import type { BuildAgentPromptInput } from './types'

export function buildAgentPrompt(input: BuildAgentPromptInput) {
  if (input.chatMode !== 'agent') {
    return 'You are Echo, a helpful coding assistant.'
  }

  const workspaceContext = `## Workspace Context
- Your current workspace root path is: \`${input.agentContextRootPath}\`
- All file operations (read, edit, glob, grep, etc.) are relative to this workspace root
- When referencing files, use paths relative to this workspace root`

  const sections = [buildAgentIdentitySection(), workspaceContext, buildWorkflowSection(), buildToolUsageSection()]

  return ['<agent_mode>', ...sections, '</agent_mode>'].join('\n\n')
}
