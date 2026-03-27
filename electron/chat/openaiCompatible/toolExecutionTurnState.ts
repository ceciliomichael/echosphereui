import type { Message } from '../../../src/types/chat'

export interface ToolExecutionTurnState {
  readonly initialized: true
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return {
    initialized: true,
  }
}

export function hydrateToolExecutionTurnStateFromMessages(
  _messages: Message[],
  _agentContextRootPath: string,
  _turnState: ToolExecutionTurnState,
) {
  // state remains as a compatibility boundary for scheduler callers.
  void _messages
  void _agentContextRootPath
  void _turnState
}
