import type { Message } from '../../../src/types/chat'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import { getOpenAICompatibleToolDefinition } from './toolRegistry'
import { buildFailedToolArtifacts, buildSuccessfulToolArtifacts } from './toolResultFormatter'
import { OpenAICompatibleToolError, type OpenAICompatibleToolCall } from './toolTypes'

export interface ToolExecutionTurnState {}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Tool execution failed.'
}

function emitFailureEvent(
  toolCall: OpenAICompatibleToolCall,
  context: ProviderStreamContext,
  inMemoryMessages: Message[],
  errorMessage: string,
  startedAt: number,
  details?: Record<string, unknown>,
) {
  const completedAt = Date.now()
  const failedArtifacts = buildFailedToolArtifacts(toolCall, errorMessage, startedAt, completedAt, details)

  context.emitDelta({
    argumentsText: failedArtifacts.toolInvocation.argumentsText,
    completedAt,
    errorMessage,
    invocationId: toolCall.id,
    resultContent: failedArtifacts.resultContent,
    resultPresentation: failedArtifacts.toolInvocation.resultPresentation,
    syntheticMessage: failedArtifacts.syntheticMessage,
    toolName: toolCall.name,
    type: 'tool_invocation_failed',
  } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_failed' }>)

  inMemoryMessages.push(failedArtifacts.syntheticMessage)
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return {}
}

export function filterHistoricalToolMessages(messages: Message[]) {
  return messages.filter((message) => message.role !== 'tool')
}

export async function executeToolCallWithPolicies(
  toolCall: OpenAICompatibleToolCall,
  context: ProviderStreamContext,
  agentContextRootPath: string,
  inMemoryMessages: Message[],
  _turnState: ToolExecutionTurnState,
) {
  const startedAt = toolCall.startedAt
  const toolDefinition = getOpenAICompatibleToolDefinition(toolCall.name)

  if (!toolDefinition) {
    emitFailureEvent(toolCall, context, inMemoryMessages, `Unsupported tool: ${toolCall.name}`, startedAt)
    return
  }

  let argumentsValue: Record<string, unknown>
  try {
    argumentsValue = toolDefinition.parseArguments(toolCall.argumentsText)
  } catch (error) {
    const errorMessage = toErrorMessage(error)
    const errorDetails = error instanceof OpenAICompatibleToolError ? error.details : undefined
    emitFailureEvent(toolCall, context, inMemoryMessages, errorMessage, startedAt, errorDetails)
    return
  }

  try {
    const semanticResult = await toolDefinition.execute(argumentsValue, {
      agentContextRootPath,
      signal: context.signal,
    })
    const completedAt = Date.now()
    const successfulArtifacts = buildSuccessfulToolArtifacts(toolCall, semanticResult, startedAt, completedAt)

    context.emitDelta({
      argumentsText: successfulArtifacts.toolInvocation.argumentsText,
      completedAt,
      invocationId: toolCall.id,
      resultContent: successfulArtifacts.resultContent,
      resultPresentation: successfulArtifacts.resultPresentation,
      syntheticMessage: successfulArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_completed',
    } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_completed' }>)

    inMemoryMessages.push(successfulArtifacts.syntheticMessage)
  } catch (error) {
    const errorMessage = toErrorMessage(error)
    const errorDetails = error instanceof OpenAICompatibleToolError ? error.details : undefined
    emitFailureEvent(toolCall, context, inMemoryMessages, errorMessage, startedAt, errorDetails)
  }
}
