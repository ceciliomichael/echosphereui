import type { ThreadItem } from '@openai/codex-sdk'

export interface CodexNativeToolPolicy {
  allowCommandExecution: boolean
  allowFileChanges: boolean
  allowMcpTools: boolean
  allowWebSearch: boolean
}

export type CodexNativeToolKind = Extract<
  ThreadItem['type'],
  'command_execution' | 'file_change' | 'mcp_tool_call' | 'web_search'
>

export const DEFAULT_CODEX_NATIVE_TOOL_POLICY: CodexNativeToolPolicy = {
  allowCommandExecution: true,
  allowFileChanges: true,
  allowMcpTools: false,
  allowWebSearch: false,
}

export function isCodexNativeToolAllowed(kind: CodexNativeToolKind, policy: CodexNativeToolPolicy) {
  if (kind === 'command_execution') {
    return policy.allowCommandExecution
  }

  if (kind === 'file_change') {
    return policy.allowFileChanges
  }

  if (kind === 'mcp_tool_call') {
    return policy.allowMcpTools
  }

  return policy.allowWebSearch
}

export function buildCodexNativeToolPolicyInstructions(policy: CodexNativeToolPolicy) {
  const deniedTools: string[] = []

  if (!policy.allowCommandExecution) {
    deniedTools.push('command_execution')
  }
  if (!policy.allowFileChanges) {
    deniedTools.push('file_change')
  }
  if (!policy.allowMcpTools) {
    deniedTools.push('mcp_tool_call')
  }
  if (!policy.allowWebSearch) {
    deniedTools.push('web_search')
  }

  if (deniedTools.length === 0) {
    return null
  }

  return [
    'Native tool policy for this runtime:',
    `- Disabled native tools: ${deniedTools.join(', ')}`,
    '- Do not invoke disabled tools. Use allowed tools only.',
  ].join('\n')
}
