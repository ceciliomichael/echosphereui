import type { Message } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from './toolTypes'

export interface ToolExecutionTurnState {
  readonly initialized: true
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return { initialized: true }
}

export function hydrateToolExecutionTurnStateFromMessages(
  _messages: Message[],
  _agentContextRootPath: string,
  _turnState: ToolExecutionTurnState,
) {
  // state remains as a compatibility boundary for scheduler callers.
}

export function recordSuccessfulToolExecution(
  _toolCall: OpenAICompatibleToolCall,
  _argumentsValue: Record<string, unknown>,
  _semanticResult: Record<string, unknown>,
  _agentContextRootPath: string,
  _turnState: ToolExecutionTurnState,
) {
}
