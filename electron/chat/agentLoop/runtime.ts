import { randomUUID } from 'node:crypto'
import type { AppTerminalExecutionMode, ChatMode, ChatProviderId, Message, ReasoningEffort } from '../../../src/types/chat'
import type { ProviderStreamContext } from '../providerTypes'
import { buildReplayableMessageHistory } from '../openaiCompatible/messageHistory'
import {
  consumeBlockedRepeatedToolCall,
  createHydratedToolExecutionTurnState,
  createToolExecutionScheduler,
  resolveWorkflowTurnToolChoice,
} from '../openaiCompatible/toolExecution'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import { appendWorkflowPlanContextMessage } from '../openaiCompatible/workflowPlanContext'
import {
  appendRuntimeContextMessageIfChanged,
  readLatestRuntimeContextSnapshot,
  type RuntimeContextSnapshot,
} from './runtimeContext'

interface AgentLoopStreamRequest {
  agentContextRootPath: string
  chatMode: ChatMode
  messages: Message[]
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
  terminalExecutionMode: AppTerminalExecutionMode
}

interface AgentLoopTurnRequest {
  agentContextRootPath: string
  chatMode: ChatMode
  forceToolChoice?: 'none' | 'required'
  messages: Message[]
  modelId: string
  reasoningEffort: ReasoningEffort
}

interface AgentLoopTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

interface AgentLoopTurnOptions {
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void
}

type StreamTurnFn = (
  request: AgentLoopTurnRequest,
  context: ProviderStreamContext,
  options?: AgentLoopTurnOptions,
) => Promise<AgentLoopTurnResult>

const MAX_INCOMPLETE_PLAN_NO_TOOL_RECOVERIES = 4
const MAX_TEXT_ONLY_TOOL_RECOVERIES = 3

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function shouldRecoverFromNoToolAssistantTurn(content: string) {
  const normalizedContent = content.trim().toLowerCase()
  if (normalizedContent.length === 0) {
    return true
  }

  // Allow explicit user-facing completions and clarification questions to exit cleanly.
  if (
    normalizedContent.includes('need more information') ||
    normalizedContent.includes('can you clarify') ||
    normalizedContent.includes('could you clarify') ||
    normalizedContent.includes('what would you like') ||
    normalizedContent.includes('please clarify') ||
    normalizedContent.includes('which option') ||
    normalizedContent.includes('which one') ||
    normalizedContent.includes('anything else') ||
    normalizedContent.startsWith('done') ||
    normalizedContent.startsWith('completed') ||
    normalizedContent.startsWith('finished') ||
    normalizedContent.startsWith('all done') ||
    normalizedContent.startsWith('all set') ||
    normalizedContent.startsWith('implemented') ||
    normalizedContent.startsWith('fixed')
  ) {
    return false
  }

  return true
}

function buildInMemoryAssistantMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
  }
}

function buildInMemoryUserMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'user',
    timestamp: Date.now(),
  }
}

function toRuntimeContextSnapshot(request: AgentLoopStreamRequest): RuntimeContextSnapshot {
  return {
    agentContextRootPath: request.agentContextRootPath,
    providerId: request.providerId,
    terminalExecutionMode: request.terminalExecutionMode,
  }
}

export async function streamAgentLoopWithTools(
  request: AgentLoopStreamRequest,
  context: ProviderStreamContext,
  streamTurn: StreamTurnFn,
) {
  const inMemoryMessages = buildReplayableMessageHistory(request.messages)
  const turnState = createHydratedToolExecutionTurnState(request.messages, request.agentContextRootPath)
  let currentChatMode: ChatMode = request.chatMode
  const toolExecutionScheduler = createToolExecutionScheduler({
    agentContextRootPath: request.agentContextRootPath,
    context,
    getChatMode: () => currentChatMode,
    inMemoryMessages,
    onChatModeChange: (nextMode) => {
      currentChatMode = nextMode
    },
    turnState,
  })
  let textOnlyToolRecoveryCount = 0
  let missingToolCallRecoveryCount = 0
  let previousRuntimeContextSnapshot = readLatestRuntimeContextSnapshot(request.messages)
  const currentRuntimeContextSnapshot = toRuntimeContextSnapshot(request)

  while (!context.signal.aborted) {
    const shouldEnforceIncompletePlanRecovery = currentChatMode === 'agent'
    const resolvedToolChoiceForTurn = resolveWorkflowTurnToolChoice(turnState)
    const forcedToolChoiceForTurn = resolvedToolChoiceForTurn === 'auto' ? undefined : resolvedToolChoiceForTurn
    const replayableMessages = buildReplayableMessageHistory(inMemoryMessages)
    const workflowMessages =
      currentChatMode === 'plan'
        ? replayableMessages
        : appendWorkflowPlanContextMessage(replayableMessages, turnState)
    const runtimeContextResult = appendRuntimeContextMessageIfChanged(
      workflowMessages,
      currentRuntimeContextSnapshot,
      previousRuntimeContextSnapshot,
    )
    previousRuntimeContextSnapshot = runtimeContextResult.snapshot
    const replayableMessagesForTurn = runtimeContextResult.messages

    const scheduledToolCallIds = new Set<string>()
    const turnResult = await streamTurn(
      {
        agentContextRootPath: request.agentContextRootPath,
        chatMode: currentChatMode,
        forceToolChoice: forcedToolChoiceForTurn,
        messages: replayableMessagesForTurn,
        modelId: request.modelId,
        reasoningEffort: request.reasoningEffort,
      },
      context,
      {
        onToolCallReady(toolCall) {
          scheduledToolCallIds.add(toolCall.id)
          void toolExecutionScheduler.schedule(toolCall)
        },
      },
    )

    const hasDetectedToolCallsThisTurn = turnResult.toolCalls.length > 0 || scheduledToolCallIds.size > 0

    if (!hasDetectedToolCallsThisTurn) {
      const hasIncompleteWorkflowPlan = turnState.workflowPlan !== null && !turnState.workflowPlan.allStepsCompleted

      if (
        shouldEnforceIncompletePlanRecovery &&
        hasIncompleteWorkflowPlan &&
        missingToolCallRecoveryCount < MAX_INCOMPLETE_PLAN_NO_TOOL_RECOVERIES
      ) {
        missingToolCallRecoveryCount += 1
        if (hasText(turnResult.assistantContent)) {
          inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
        }
        inMemoryMessages.push(
          buildInMemoryUserMessage(
            'You have incomplete tasks. Continue your work on the current in_progress tasks. Use update_plan only when task statuses change.',
          ),
        )
        continue
      }

      if (
        forcedToolChoiceForTurn !== 'none' &&
        textOnlyToolRecoveryCount < MAX_TEXT_ONLY_TOOL_RECOVERIES &&
        shouldRecoverFromNoToolAssistantTurn(turnResult.assistantContent)
      ) {
        textOnlyToolRecoveryCount += 1
        if (hasText(turnResult.assistantContent)) {
          inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
        }
        inMemoryMessages.push(
          buildInMemoryUserMessage(
            '<system-reminder>\nPlease address this message and continue with your tasks.\n</system-reminder>',
          ),
        )
        continue
      }

      return
    }

    missingToolCallRecoveryCount = 0
    textOnlyToolRecoveryCount = 0

    if (hasText(turnResult.assistantContent)) {
      inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
    }

    for (const toolCall of turnResult.toolCalls) {
      if (scheduledToolCallIds.has(toolCall.id)) {
        continue
      }

      void toolExecutionScheduler.schedule(toolCall)
    }

    await toolExecutionScheduler.drain()

    if (consumeBlockedRepeatedToolCall(turnState)) {
      return
    }

    if (context.signal.aborted) {
      return
    }
  }
}

export type { AgentLoopStreamRequest, AgentLoopTurnRequest, AgentLoopTurnResult, AgentLoopTurnOptions, StreamTurnFn }
