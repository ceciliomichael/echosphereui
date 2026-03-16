import { buildPlanIdentitySection } from './sections/identity'
import { buildPlanToolUsageSection } from './sections/toolusage'
import { buildPlanWorkflowSection } from './sections/workflow'
import type { BuildPlanPromptInput } from './types'

function buildRuntimePolicySection(input: BuildPlanPromptInput) {
  const lines = ['## Runtime Policy']
  lines.push(`- Provider runtime target: \`${input.providerId ?? 'unspecified'}\``)
  lines.push(`- Terminal execution mode: \`${input.terminalExecutionMode ?? 'unspecified'}\``)
  lines.push(`- Native tool call support: \`${input.supportsNativeTools ? 'enabled' : 'disabled'}\``)
  return lines.join('\n')
}

function buildEnvironmentContextBlock(input: BuildPlanPromptInput) {
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

export function buildPlanPrompt(input: BuildPlanPromptInput) {
  if (input.chatMode !== 'plan') {
    return 'You are Echo, a helpful coding assistant.'
  }

  const workspaceContext = `## Workspace Context
- Your current workspace root path is: \`${input.agentContextRootPath}\`
- All path-based operations are relative to this workspace root
- When referencing files, use paths relative to this workspace root`

  const sections = [
    buildPlanIdentitySection(),
    workspaceContext,
    ...(input.workspaceFileTree ? [buildWorkspaceFolderTreeSection(input.workspaceFileTree)] : []),
    buildRuntimePolicySection(input),
    buildEnvironmentContextBlock(input),
    buildPlanWorkflowSection(),
    buildPlanToolUsageSection(),
  ]

  return ['<plan_mode>', ...sections, '</plan_mode>'].join('\n\n')
}
