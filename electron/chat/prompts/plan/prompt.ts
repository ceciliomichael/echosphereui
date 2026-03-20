import { buildShellContextSection } from '../shared/runtimeContext'
import type { BuildPlanPromptInput } from './types'

function buildIdentitySection() {
  return [
    '<identity>',
    '## Identity',
    'You are Echo in Plan mode. Stay context-first and practical. Keep the plan narrow, concrete, and tied to the workspace, and explain the why behind each step without drifting into unrelated ideas.',
    '</identity>',
  ].join('\n')
}

function buildWorkspaceContextSection(input: BuildPlanPromptInput) {
  return [
    '<workspace_context>',
    '## Workspace Context',
    `Workspace root: \`${input.agentContextRootPath}\`. Assume the user is asking about this workspace unless they say otherwise, and keep the plan anchored to files, folders, and behavior inside that root. When you mention paths, prefer clear file and folder references relative to the workspace, and use absolute filesystem paths whenever a tool requires them.`,
    '</workspace_context>',
  ].join('\n')
}

function buildToolUsageSection() {
  return [
    '<toolusage>',
    '## Tool Usage',
    'Use only the planning tools available in this mode. Inspect the workspace before proposing changes. Use update_plan only when the work is large enough to benefit from tracked steps. When a tool requires a path, send a real absolute filesystem path rooted in the workspace and describe the target clearly. Do not emit pseudo tool calls in plain text.',
    '</toolusage>',
  ].join('\n')
}

function buildTaskFlowSection() {
  return [
    '<workflow>',
    '## Workflow',
    'Read the workspace context first. Make a concrete plan with files, boundaries, and checks. Stay within scope and avoid speculative refactors. Hand off clearly for implementation after the plan is ready, with enough detail that the next step is obvious.',
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

export function buildPlanPrompt(input: BuildPlanPromptInput) {
  if (input.chatMode !== 'plan') {
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

  return ['<plan_mode>', ...sections, '</plan_mode>'].join('\n\n')
}
