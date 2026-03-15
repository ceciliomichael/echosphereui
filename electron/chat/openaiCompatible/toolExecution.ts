import type { Message } from '../../../src/types/chat'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import { getOpenAICompatibleToolDefinition } from './toolRegistry'
import { buildFailedToolArtifacts, buildSuccessfulToolArtifacts } from './toolResultFormatter'
import {
  createToolExecutionTurnState,
  getDuplicateInspectionCallError,
  hydrateToolExecutionTurnStateFromMessages,
  recordSuccessfulToolExecution,
  type ToolExecutionTurnState,
} from './toolExecutionTurnState'
import {
  OpenAICompatibleToolError,
  type OpenAICompatibleToolCall,
  type OpenAICompatibleToolExecutionMode,
} from './toolTypes'

export { createToolExecutionTurnState } from './toolExecutionTurnState'
export type { ToolExecutionTurnState } from './toolExecutionTurnState'

interface ToolExecutionSchedulerInput {
  agentContextRootPath: string
  context: ProviderStreamContext
  inMemoryMessages: Message[]
  turnState: ToolExecutionTurnState
}

interface ToolExecutionSchedulerDependencies {
  executeToolCall?: typeof executeToolCallWithPolicies
  resolveExecutionMode?: (toolName: string) => OpenAICompatibleToolExecutionMode
  resolveExecutionResourceKey?: (toolCall: OpenAICompatibleToolCall) => string | null
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

export function resolveToolExecutionMode(toolName: string): OpenAICompatibleToolExecutionMode {
  return getOpenAICompatibleToolDefinition(toolName)?.executionMode ?? 'exclusive'
}

export function createHydratedToolExecutionTurnState(messages: Message[], agentContextRootPath: string) {
  const turnState = createToolExecutionTurnState()
  hydrateToolExecutionTurnStateFromMessages(messages, agentContextRootPath, turnState)
  return turnState
}

function normalizeExecutionResourceKey(absolutePath: string) {
  const normalizedPath = absolutePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}

export function resolveToolExecutionResourceKey(toolCall: OpenAICompatibleToolCall) {
  const toolDefinition = getOpenAICompatibleToolDefinition(toolCall.name)
  if (!toolDefinition || toolDefinition.executionMode !== 'path-exclusive') {
    return null
  }

  try {
    const argumentsValue = toolDefinition.parseArguments(toolCall.argumentsText)
    const absolutePath = argumentsValue.absolute_path
    if (typeof absolutePath !== 'string' || absolutePath.trim().length === 0) {
      return null
    }

    return normalizeExecutionResourceKey(absolutePath.trim())
  } catch {
    return null
  }
}

export async function executeToolCallWithPolicies(
  toolCall: OpenAICompatibleToolCall,
  context: ProviderStreamContext,
  agentContextRootPath: string,
  inMemoryMessages: Message[],
  turnState: ToolExecutionTurnState,
) {
  void turnState
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
    const duplicateInspectionCallError = getDuplicateInspectionCallError(
      toolCall,
      argumentsValue,
      agentContextRootPath,
      turnState,
    )
    if (duplicateInspectionCallError) {
      emitFailureEvent(
        toolCall,
        context,
        inMemoryMessages,
        duplicateInspectionCallError.message,
        startedAt,
        duplicateInspectionCallError.details,
      )
      return
    }

    const semanticResult = await toolDefinition.execute(argumentsValue, {
      agentContextRootPath,
      signal: context.signal,
      streamId: context.streamId,
      terminalExecutionMode: context.terminalExecutionMode,
      workspaceCheckpointId: context.workspaceCheckpointId,
    })
    const completedAt = Date.now()
    const successfulArtifacts = buildSuccessfulToolArtifacts(toolCall, semanticResult, startedAt, completedAt)
    recordSuccessfulToolExecution(toolCall, argumentsValue, semanticResult, agentContextRootPath, turnState)

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
  const resolveExecutionResourceKey = dependencies.resolveExecutionResourceKey ?? resolveToolExecutionResourceKey
  let exclusiveBarrier: Promise<void> = Promise.resolve()
  const activeNonExclusiveExecutions = new Set<Promise<void>>()
  const resourceBarriers = new Map<string, Promise<void>>()
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
        activeNonExclusiveExecutions,
      )
    }

    if (executionMode === 'path-exclusive') {
      const resourceKey = resolveExecutionResourceKey(toolCall)
      if (resourceKey) {
        const resourceBarrier = resourceBarriers.get(resourceKey) ?? Promise.resolve()
        const resourceExecution = exclusiveBarrier
          .then(() => resourceBarrier)
          .then(() =>
            executeToolCall(
              toolCall,
              input.context,
              input.agentContextRootPath,
              input.inMemoryMessages,
              input.turnState,
            ),
          )

        const trackedResourceExecution = trackExecution(resourceExecution, activeNonExclusiveExecutions)
        const nextResourceBarrier = trackedResourceExecution.catch(() => undefined)
        resourceBarriers.set(resourceKey, nextResourceBarrier)
        nextResourceBarrier.finally(() => {
          if (resourceBarriers.get(resourceKey) === nextResourceBarrier) {
            resourceBarriers.delete(resourceKey)
          }
        }).catch(() => {
          // Resource cleanup should not surface as an unhandled rejection.
        })

        return trackedResourceExecution
      }
    }

    const pendingNonExclusiveExecutions = Array.from(activeNonExclusiveExecutions)
    const exclusiveExecution = exclusiveBarrier
      .then(() => Promise.allSettled(pendingNonExclusiveExecutions))
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
