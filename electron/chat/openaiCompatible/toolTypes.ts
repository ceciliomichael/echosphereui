import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'

export interface OpenAICompatibleToolCall {
  argumentsText: string
  id: string
  name: string
}

export interface OpenAICompatibleToolExecutionContext {
  agentContextRootPath: string
  signal: AbortSignal
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
  execute: (
    argumentsValue: Record<string, unknown>,
    context: OpenAICompatibleToolExecutionContext,
  ) => Promise<Record<string, unknown>>
  name: string
  parseArguments: (argumentsText: string) => Record<string, unknown>
  tool: ChatCompletionTool
}
