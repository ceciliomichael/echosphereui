import type { ChatMode, Message } from '../../../src/types/chat'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import { getOpenAICompatibleToolDefinition } from './toolRegistry'
import { buildFailedToolArtifacts, buildSuccessfulToolArtifacts } from './toolResultFormatter'
import {
  createToolExecutionTurnState,
  hydrateToolExecutionTurnStateFromMessages,
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
  chatMode?: ChatMode
  context: ProviderStreamContext
  getChatMode?: () => ChatMode
  inMemoryMessages: Message[]
  onChatModeChange?: (nextMode: ChatMode) => void
  turnState: ToolExecutionTurnState
}

interface ToolExecutionSchedulerDependencies {
  executeToolCall?: typeof executeToolCallWithPolicies
  resolveExecutionMode?: (toolName: string, chatMode: ChatMode) => OpenAICompatibleToolExecutionMode
  resolveExecutionResourceKey?: (toolCall: OpenAICompatibleToolCall, chatMode: ChatMode) => string | null
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

export function resolveToolExecutionMode(
  toolName: string,
  chatMode: ChatMode,
): OpenAICompatibleToolExecutionMode {
  return getOpenAICompatibleToolDefinition(toolName, chatMode)?.executionMode ?? 'exclusive'
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

function readNextChatMode(semanticResult: Record<string, unknown>): ChatMode | null {
  const nextChatMode = semanticResult.nextChatMode
  if (nextChatMode === 'agent' || nextChatMode === 'plan') {
    return nextChatMode
  }

  return null
}

export function resolveToolExecutionResourceKey(toolCall: OpenAICompatibleToolCall, chatMode: ChatMode) {
  const toolDefinition = getOpenAICompatibleToolDefinition(toolCall.name, chatMode)
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
  chatModeOrInMemoryMessages: ChatMode | Message[],
  inMemoryMessagesOrTurnState: Message[] | ToolExecutionTurnState,
  _maybeTurnState?: ToolExecutionTurnState,
  onChatModeChange?: (nextMode: ChatMode) => void,
) {
  const chatMode = typeof chatModeOrInMemoryMessages === 'string' ? chatModeOrInMemoryMessages : 'agent'
  const inMemoryMessages = Array.isArray(chatModeOrInMemoryMessages)
    ? chatModeOrInMemoryMessages
    : (inMemoryMessagesOrTurnState as Message[])

  const startedAt = toolCall.startedAt
  const toolDefinition = getOpenAICompatibleToolDefinition(toolCall.name, chatMode)

  if (!toolDefinition) {
    emitFailureEvent(toolCall, context, inMemoryMessages, 'Unsupported tool in the current mode.', startedAt)
    return
  }

  let argumentsValue: Record<string, unknown>
  try {
    argumentsValue = toolDefinition.parseArguments(toolCall.argumentsText)
  } catch (error) {
    const errorMessage = toErrorMessage(error)
    const errorDetails = error instanceof OpenAICompatibleToolError ? error.details : undefined
    console.log('[tool-execution:parse-arguments-failed]', {
      errorDetails: errorDetails ?? null,
      errorMessage,
      invocationId: toolCall.id,
      rawArgumentsLength: toolCall.argumentsText.length,
      rawArgumentsPreview:
        toolCall.argumentsText.length > 800 ? `${toolCall.argumentsText.slice(0, 800)}…` : toolCall.argumentsText,
      toolName: toolCall.name,
    })
    emitFailureEvent(toolCall, context, inMemoryMessages, errorMessage, startedAt, errorDetails)
    return
  }

  try {
    const semanticResult = await toolDefinition.execute(argumentsValue, {
      agentContextRootPath,
      requestUserDecision: context.awaitUserDecision
        ? (input) =>
            context.awaitUserDecision?.({
              allowCustomAnswer: input.allowCustomAnswer,
              invocationId: toolCall.id,
              kind: input.kind,
              options: input.options,
              prompt: input.prompt,
              toolName: toolCall.name,
            }) ?? Promise.reject(new Error('User decision support is unavailable in this runtime context.'))
        : undefined,
      signal: context.signal,
      streamId: context.streamId,
      terminalExecutionMode: context.terminalExecutionMode,
      workspaceCheckpointId: context.workspaceCheckpointId,
    })
    const nextChatMode = readNextChatMode(semanticResult)
    if (nextChatMode) {
      onChatModeChange?.(nextChatMode)
    }
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
  const resolveExecutionResourceKey = dependencies.resolveExecutionResourceKey ?? resolveToolExecutionResourceKey
  const getCurrentChatMode =
    input.getChatMode ??
    (() => {
      const resolvedChatMode = input.chatMode
      return resolvedChatMode === 'plan' ? 'plan' : 'agent'
    })
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
    const currentChatMode = getCurrentChatMode()
    const executionMode = resolveExecutionMode(toolCall.name, currentChatMode)
    if (executionMode === 'parallel') {
      return trackExecution(
        exclusiveBarrier.then(() =>
          executeToolCall(
            toolCall,
            input.context,
            input.agentContextRootPath,
            currentChatMode,
            input.inMemoryMessages,
            input.turnState,
            input.onChatModeChange,
          ),
        ),
        activeNonExclusiveExecutions,
      )
    }

    if (executionMode === 'path-exclusive') {
      const resourceKey = resolveExecutionResourceKey(toolCall, currentChatMode)
      if (resourceKey) {
        const resourceBarrier = resourceBarriers.get(resourceKey) ?? Promise.resolve()
        const resourceExecution = exclusiveBarrier
          .then(() => resourceBarrier)
          .then(() =>
            executeToolCall(
              toolCall,
              input.context,
              input.agentContextRootPath,
              getCurrentChatMode(),
              input.inMemoryMessages,
              input.turnState,
              input.onChatModeChange,
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
          getCurrentChatMode(),
          input.inMemoryMessages,
          input.turnState,
          input.onChatModeChange,
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
