import type { ToolInvocationResultPresentation } from '../../../src/types/chat'

export interface AgentToolResultSubject {
  kind?: string
  path?: string
}

export interface AgentToolExecutionResult {
  body?: string
  resultPresentation?: ToolInvocationResultPresentation
  semantics?: Record<string, unknown>
  status: 'error' | 'success'
  subject?: AgentToolResultSubject
  summary: string
  truncated?: boolean
}

export interface AgentToolContext {
  checkpointId?: string | null
  workspaceRootPath: string
}
