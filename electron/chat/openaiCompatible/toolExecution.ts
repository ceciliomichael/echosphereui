import type { Message } from '../../../src/types/chat'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import { getOpenAICompatibleToolDefinition } from './toolRegistry'
import { buildFailedToolArtifacts, buildSuccessfulToolArtifacts } from './toolResultFormatter'
import {
  OpenAICompatibleToolError,
  type OpenAICompatibleToolCall,
  type OpenAICompatibleToolExecutionMode,
} from './toolTypes'

export interface ToolExecutionTurnState {}

interface ToolExecutionSchedulerInput {
  agentContextRootPath: string
  context: ProviderStreamContext
  inMemoryMessages: Message[]
  turnState: ToolExecutionTurnState
}

interface ToolExecutionSchedulerDependencies {
  executeToolCall?: typeof executeToolCallWithPolicies
  resolveExecutionMode?: (toolName: string) => OpenAICompatibleToolExecutionMode
}

export interface ToolExecutionScheduler {
  drain: () => Promise<void>
  schedule: (toolCall: OpenAICompatibleToolCall) => Promise<void>
}

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

export function resolveToolExecutionMode(toolName: string): OpenAICompatibleToolExecutionMode {
  return getOpenAICompatibleToolDefinition(toolName)?.executionMode ?? 'exclusive'
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

export function createToolExecutionScheduler(
  input: ToolExecutionSchedulerInput,
  dependencies: ToolExecutionSchedulerDependencies = {},
): ToolExecutionScheduler {
  const executeToolCall = dependencies.executeToolCall ?? executeToolCallWithPolicies
  const resolveExecutionMode = dependencies.resolveExecutionMode ?? resolveToolExecutionMode
  let exclusiveBarrier: Promise<void> = Promise.resolve()
  const activeParallelExecutions = new Set<Promise<void>>()
  const scheduledExecutions = new Set<Promise<void>>()

  function trackExecution(execution: Promise<void>, activeSet?: Set<Promise<void>>) {
    scheduledExecutions.add(execution)
    if (activeSet) {
      activeSet.add(execution)
    }

    execution.finally(() => {
      scheduledExecutions.delete(execution)
      activeSet?.delete(execution)
    }).catch(() => {
      // Drain uses allSettled; swallow here to avoid unhandled rejection noise.
    })

    return execution
  }

  function schedule(toolCall: OpenAICompatibleToolCall) {
    const executionMode = resolveExecutionMode(toolCall.name)
    if (executionMode === 'parallel') {
      return trackExecution(
        exclusiveBarrier.then(() =>
          executeToolCall(
            toolCall,
            input.context,
            input.agentContextRootPath,
            input.inMemoryMessages,
            input.turnState,
          ),
        ),
        activeParallelExecutions,
      )
    }

    const pendingParallelExecutions = Array.from(activeParallelExecutions)
    const exclusiveExecution = exclusiveBarrier
      .then(() => Promise.allSettled(pendingParallelExecutions))
      .then(() =>
        executeToolCall(
          toolCall,
          input.context,
          input.agentContextRootPath,
          input.inMemoryMessages,
          input.turnState,
        ),
      )

    const trackedExclusiveExecution = trackExecution(exclusiveExecution)
    exclusiveBarrier = trackedExclusiveExecution.catch(() => undefined)
    return trackedExclusiveExecution
  }

  async function drain() {
    if (scheduledExecutions.size === 0) {
      return
    }

    await Promise.allSettled(Array.from(scheduledExecutions))
  }

  return {
    drain,
    schedule,
  }
}
