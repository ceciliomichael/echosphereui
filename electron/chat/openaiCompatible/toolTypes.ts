import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'
import type { AppTerminalExecutionMode } from '../../../src/types/chat'

export interface OpenAICompatibleToolCall {
  argumentsText: string
  id: string
  name: string
  startedAt: number
}

export type OpenAICompatibleToolExecutionMode = 'exclusive' | 'parallel' | 'path-exclusive'

export interface OpenAICompatibleToolExecutionContext {
  agentContextRootPath: string
  signal: AbortSignal
  streamId: string
  terminalExecutionMode: AppTerminalExecutionMode
  workspaceCheckpointId: string | null
}

export class OpenAICompatibleToolError extends Error {
  details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'OpenAICompatibleToolError'
    this.details = details
  }
}

export interface OpenAICompatibleToolDefinition {
  executionMode: OpenAICompatibleToolExecutionMode
  execute: (
    argumentsValue: Record<string, unknown>,
    context: OpenAICompatibleToolExecutionContext,
  ) => Promise<Record<string, unknown>>
  name: string
  parseArguments: (argumentsText: string) => Record<string, unknown>
  tool: ChatCompletionTool
}
