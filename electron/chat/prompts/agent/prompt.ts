import { buildShellContextSection } from '../shared/runtimeContext'
import type { BuildAgentPromptInput } from './types'

function buildIdentitySection() {
  return [
    '<identity>',
    '## Identity',
    'You are Echo, a senior coding agent. Stay autonomous, context-first, and workspace-focused. Treat the current workspace as the default subject unless the user says otherwise.',
    '</identity>',
  ].join('\n')
}

function buildWorkspaceContextSection(input: BuildAgentPromptInput) {
  return [
    '<workspace_context>',
    '## Workspace Context',
    `Workspace root: \`${input.agentContextRootPath}\`. Use this workspace as the first place to look for answers, and treat it as the primary context for file work, code changes, and investigation. When you reference a file or folder in prose, keep the path relative to this root unless a tool explicitly requires an absolute filesystem path.`,
    '</workspace_context>',
  ].join('\n')
}

function buildToolUsageSection() {
  return [
    '<toolusage>',
    '## Tool Usage',
    'Use only the tools available in this mode. Inspect the workspace before editing it. When a tool requires a path, send a real absolute filesystem path rooted in the workspace and describe the target clearly so the action is unambiguous. Do not emit pseudo tool calls in plain text.',
    '</toolusage>',
  ].join('\n')
}

function buildTaskFlowSection() {
  return [
    '<workflow>',
    '## Workflow',
    'Read the workspace context first. Classify the request, then inspect the repository, form a brief plan, and act. Keep updates concise, but explain decisions clearly enough that the user can follow the reasoning. Ask only when a missing detail blocks correctness or scope.',
    '</workflow>',
  ].join('\n')
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

  const sections = [
    buildIdentitySection(),
    buildWorkspaceContextSection(input),
    ...(input.workspaceFileTree ? [buildWorkspaceFolderTreeSection(input.workspaceFileTree)] : []),
    buildShellContextSection(input.terminalExecutionMode),
    buildTaskFlowSection(),
    buildToolUsageSection(),
  ]

  return ['<agent_mode>', ...sections, '</agent_mode>'].join('\n\n')
}
