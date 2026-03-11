import type { ChatCompletionTool } from 'openai/resources/chat/completions/completions'

export interface OpenAICompatibleToolCall {
  argumentsText: string
  id: string
  name: string
}

export interface OpenAICompatibleToolDefinition {
  execute: (argumentsValue: Record<string, unknown>) => Promise<Record<string, unknown>>
  name: string
  parseArguments: (argumentsText: string) => Record<string, unknown>
  tool: ChatCompletionTool
}
