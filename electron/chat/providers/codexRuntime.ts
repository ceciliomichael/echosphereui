import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import {
  createToolExecutionTurnState,
  executeToolCallWithPolicies,
} from '../openaiCompatible/toolExecution'
import type { ProviderStreamContext, ProviderStreamRequest } from '../providerTypes'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'

export {
  buildCodexInputMessages,
  buildCodexPayload,
  getCodexToolDefinitions,
  toCodexInputMessage,
} from './codexPayload'
export type {
  CodexFunctionToolDefinition,
  CodexInputMessage,
  CodexMessageContentItem,
  CodexRequestPayload,
} from './codexPayload'
export { parseSseResponseStream } from './codexSseParser'
export type { CodexStreamTurnResult } from './codexSseAccumulator'

export function buildInMemoryAssistantMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
  }
}

export async function executeCodexToolCall(
  toolCall: OpenAICompatibleToolCall,
  context: ProviderStreamContext,
  request: ProviderStreamRequest,
  inMemoryMessages: Message[],
  turnState: ReturnType<typeof createToolExecutionTurnState>,
) {
  await executeToolCallWithPolicies(toolCall, context, request.agentContextRootPath, inMemoryMessages, turnState)
}
