export interface ToolExecutionTurnState {
  readonly initialized: true
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return {
    initialized: true,
  }
}

export function hydrateToolExecutionTurnStateFromMessages(
  _messages: unknown[],
  _agentContextRootPath: string,
  turnState: ToolExecutionTurnState,
) {
  void turnState
}
