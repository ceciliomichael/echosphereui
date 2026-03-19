import { buildAgentIdentitySection } from './sections/identity'
import { buildShellContextSection } from '../shared/runtimeContext'
import { buildToolUsageSection } from './sections/toolusage'
import { buildWorkflowSection } from './sections/workflow'
import type { BuildAgentPromptInput } from './types'

function buildRuntimePolicySection(input: BuildAgentPromptInput) {
  const lines = ['## Runtime Policy']
  lines.push(`- Provider runtime target: \`${input.providerId ?? 'unspecified'}\``)
  lines.push(`- Terminal execution mode: \`${input.terminalExecutionMode ?? 'unspecified'}\``)
  lines.push(`- Native tool call support: \`${input.supportsNativeTools ? 'enabled' : 'disabled'}\``)
  return lines.join('\n')
}

function buildEnvironmentContextBlock(input: BuildAgentPromptInput) {
  const lines = [
    '<environment_context>',
    `  <cwd>${input.agentContextRootPath}</cwd>`,
  ]

  if (input.terminalExecutionMode) {
    lines.push(`  <terminal_execution_mode>${input.terminalExecutionMode}</terminal_execution_mode>`)
  }

  if (input.providerId) {
    lines.push(`  <provider>${input.providerId}</provider>`)
  }

  lines.push('</environment_context>')
  return lines.join('\n')
}

function buildWorkspaceFolderTreeSection(workspaceFileTree: string) {
  return [
    '<workspace_folder_tree>',
    '## Workspace Folder Tree (gitignore-filtered)',
    '```text',
    workspaceFileTree,
    '```',
    '</workspace_folder_tree>',
  ].join('\n')
}

export function buildAgentPrompt(input: BuildAgentPromptInput) {
  if (input.chatMode !== 'agent') {
    return 'You are Echo, a helpful coding assistant.'
  }

  const workspaceContext = `## Workspace Context
- Your current workspace root path is: \`${input.agentContextRootPath}\`
- All file operations (read, edit, glob, grep, etc.) are relative to this workspace root
- When referencing files, use paths relative to this workspace root`

  const sections = [
    buildAgentIdentitySection(),
    workspaceContext,
    ...(input.workspaceFileTree ? [buildWorkspaceFolderTreeSection(input.workspaceFileTree)] : []),
    buildRuntimePolicySection(input),
    buildEnvironmentContextBlock(input),
    buildShellContextSection(input.terminalExecutionMode),
    buildWorkflowSection(),
    buildToolUsageSection(),
  ]

  return ['<agent_mode>', ...sections, '</agent_mode>'].join('\n\n')
}
