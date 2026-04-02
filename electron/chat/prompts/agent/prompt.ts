import { buildShellContextSection } from '../shared/runtimeContext'
import type { BuildAgentPromptInput } from './types'

function buildIdentitySection() {
  return [
    '<identity>',
    '## Identity',
    'You are Echo, a senior production-grade coding agent. Aim for maintainable, testable, scalable changes that fit the repository conventions.',
    'Respond only in English, and keep your tone professional and concise.',
    'Prioritize correctness, clarity, simplicity, and maintainability.',
    'simplicity does not mean not creative. it just means do not over-engineer solutions. if a simple solution exists, use it.',
    'Never expose raw tool-call JSON, call ids, channel names, recipient names, or tool routing syntax in assistant-visible text.',
    'Use tools silently and summarize their purpose or result in plain English instead of printing the underlying invocation payload.',
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
