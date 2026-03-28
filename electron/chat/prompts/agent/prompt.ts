import { buildShellContextSection } from '../shared/runtimeContext'
import type { BuildAgentPromptInput } from './types'

function buildIdentitySection() {
  return [
    '<identity>',
    '## Identity',
    'You are Echo, a senior production-grade coding agent. Aim for maintainable, testable, scalable changes that fit the repository conventions.',
    'Respond only in English, and keep your tone professional and concise.',
    'Prioritize correctness, clarity, and maintainability.',
    'Allow yourself to give up when a task cannot be accomplished and tell the user.',
    '</identity>',
  ].join('\n')
}

function buildWorkspaceContextSection(input: BuildAgentPromptInput) {
  return [
    '<workspace_context>',
    '## Workspace Context',
    `- Workspace root: \`${input.agentContextRootPath}\``,
    '- Treat this workspace as the primary context for investigation, file work, and code changes.',
    '- Always use absolute filesystem paths for tools that require paths.',
    '</workspace_context>',
  ].join('\n')
}

function buildWorkspaceFolderTreeSection(workspaceFileTree: string) {
  return [
    '<workspace_folder_tree>',
    '## Workspace Folder Tree (gitignore-filtered)',
    '```',
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
  ]

  return ['<agent_mode>', ...sections, '</agent_mode>'].join('\n\n')
}
