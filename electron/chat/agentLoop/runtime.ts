import { randomUUID } from 'node:crypto'
import type { AppTerminalExecutionMode, ChatMode, ChatProviderId, Message, ReasoningEffort } from '../../../src/types/chat'
import type { ProviderStreamContext } from '../providerTypes'
import { buildReplayableMessageHistory } from '../openaiCompatible/messageHistory'
import {
  createHydratedToolExecutionTurnState,
  createToolExecutionScheduler,
  resolveWorkflowTurnToolChoice,
} from '../openaiCompatible/toolExecution'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import {
  appendRuntimeContextMessageIfChanged,
  readLatestRuntimeContextSnapshot,
  type RuntimeContextSnapshot,
} from './runtimeContext'

interface AgentLoopStreamRequest {
  agentContextRootPath: string
  chatMode: ChatMode
  haltOnPlanToAgentSwitch?: boolean
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

interface AgentLoopStreamResult {
  finalChatMode: ChatMode
  messages: Message[]
  transitionedPlanToAgent: boolean
}

type StreamTurnFn = (
  request: AgentLoopTurnRequest,
  context: ProviderStreamContext,
  options?: AgentLoopTurnOptions,
) => Promise<AgentLoopTurnResult>

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function buildInMemoryAssistantMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'assistant',
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
): Promise<AgentLoopStreamResult> {
  function buildStreamResult(): AgentLoopStreamResult {
    return {
      finalChatMode: currentChatMode,
      messages: buildReplayableMessageHistory(inMemoryMessages),
      transitionedPlanToAgent: sawPlanToAgentModeSwitch,
    }
  }

  const inMemoryMessages = buildReplayableMessageHistory(request.messages)
  const turnState = createHydratedToolExecutionTurnState(request.messages, request.agentContextRootPath)
  let currentChatMode: ChatMode = request.chatMode
  let sawPlanToAgentModeSwitch = false
  const toolExecutionScheduler = createToolExecutionScheduler({
    agentContextRootPath: request.agentContextRootPath,
    context,
    getChatMode: () => currentChatMode,
    inMemoryMessages,
    onChatModeChange: (nextMode) => {
      if (currentChatMode === 'plan' && nextMode === 'agent') {
        sawPlanToAgentModeSwitch = true
      }
      currentChatMode = nextMode
    },
    turnState,
  })
  let previousRuntimeContextSnapshot = readLatestRuntimeContextSnapshot(request.messages)
  const currentRuntimeContextSnapshot = toRuntimeContextSnapshot(request)

  while (!context.signal.aborted) {
    const resolvedToolChoiceForTurn = resolveWorkflowTurnToolChoice(turnState)
    const forcedToolChoiceForTurn = resolvedToolChoiceForTurn === 'auto' ? undefined : resolvedToolChoiceForTurn
    const replayableMessages = buildReplayableMessageHistory(inMemoryMessages)
    const runtimeContextResult = appendRuntimeContextMessageIfChanged(
      replayableMessages,
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
      return buildStreamResult()
    }

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

    if (request.haltOnPlanToAgentSwitch && sawPlanToAgentModeSwitch) {
      return buildStreamResult()
    }

    if (context.signal.aborted) {
      return buildStreamResult()
    }
  }

  return buildStreamResult()
}

export type {
  AgentLoopStreamRequest,
  AgentLoopStreamResult,
  AgentLoopTurnRequest,
  AgentLoopTurnResult,
  AgentLoopTurnOptions,
  StreamTurnFn,
}
