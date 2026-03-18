import type { Message } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from './toolTypes'

type WorkflowStepStatus = 'completed' | 'in_progress' | 'pending'
const MAX_TRACKED_RECENT_TOOL_CALL_ATTEMPTS = 6

export const MAX_CONSECUTIVE_IDENTICAL_TOOL_CALLS = 3

interface WorkflowPlanStep {
  id: string
  status: WorkflowStepStatus
  title: string
}

interface RecentToolCallAttempt {
  argumentsFingerprint: string
  toolName: string
}

interface BlockedRepeatedToolCall {
  argumentsFingerprint: string
  consecutiveAttemptCount: number
  toolName: string
}

interface WorkflowPlanState {
  allStepsCompleted: boolean
  hasIncompleteSteps: boolean
  planId: string
  steps: WorkflowPlanStep[]
  updatedAt: number
}

export interface ToolExecutionTurnState {
  blockedRepeatedToolCall: BlockedRepeatedToolCall | null
  readonly initialized: true
  recentToolCallAttempts: RecentToolCallAttempt[]
  workflowPlan: WorkflowPlanState | null
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return {
    blockedRepeatedToolCall: null,
    initialized: true,
    recentToolCallAttempts: [],
    workflowPlan: null,
  }
}

export function hydrateToolExecutionTurnStateFromMessages(
  _messages: Message[],
  _agentContextRootPath: string,
  _turnState: ToolExecutionTurnState,
) {
  // state remains as a compatibility boundary for scheduler callers.
}

export function recordSuccessfulToolExecution(
  toolCall: OpenAICompatibleToolCall,
  _argumentsValue: Record<string, unknown>,
  semanticResult: Record<string, unknown>,
  _agentContextRootPath: string,
  turnState: ToolExecutionTurnState,
) {
  if (toolCall.name !== 'update_plan') {
    return
  }

  const normalizedWorkflowPlan = normalizeWorkflowPlanState(semanticResult)
  if (!normalizedWorkflowPlan) {
    return
  }

  turnState.workflowPlan = normalizedWorkflowPlan
}

export function countTrailingMatchingToolCallAttempts(
  turnState: ToolExecutionTurnState,
  toolName: string,
  argumentsFingerprint: string,
) {
  let matchingAttemptCount = 0

  for (let index = turnState.recentToolCallAttempts.length - 1; index >= 0; index -= 1) {
    const attempt = turnState.recentToolCallAttempts[index]
    if (!attempt || attempt.toolName !== toolName || attempt.argumentsFingerprint !== argumentsFingerprint) {
      break
    }

    matchingAttemptCount += 1
  }

  return matchingAttemptCount
}

export function recordToolCallAttempt(
  turnState: ToolExecutionTurnState,
  toolCall: Pick<OpenAICompatibleToolCall, 'name'>,
  argumentsFingerprint: string,
) {
  turnState.recentToolCallAttempts.push({
    argumentsFingerprint,
    toolName: toolCall.name,
  })

  if (turnState.recentToolCallAttempts.length > MAX_TRACKED_RECENT_TOOL_CALL_ATTEMPTS) {
    turnState.recentToolCallAttempts.splice(0, turnState.recentToolCallAttempts.length - MAX_TRACKED_RECENT_TOOL_CALL_ATTEMPTS)
  }
}

export function recordBlockedRepeatedToolCall(
  turnState: ToolExecutionTurnState,
  toolName: string,
  argumentsFingerprint: string,
  consecutiveAttemptCount: number,
) {
  turnState.blockedRepeatedToolCall = {
    argumentsFingerprint,
    consecutiveAttemptCount,
    toolName,
  }
}

export function consumeBlockedRepeatedToolCall(turnState: ToolExecutionTurnState) {
  const blockedRepeatedToolCall = turnState.blockedRepeatedToolCall
  turnState.blockedRepeatedToolCall = null
  return blockedRepeatedToolCall
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function normalizeWorkflowStep(value: unknown): WorkflowPlanStep | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const id = readString(record.id)?.trim()
  const title = readString(record.title)?.trim()
  const status = readString(record.status)?.trim().toLowerCase()
  if (!id || !title || !status) {
    return null
  }

  if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') {
    return null
  }

  return {
    id,
    status,
    title,
  }
}

function normalizeWorkflowPlanState(semanticResult: Record<string, unknown>): WorkflowPlanState | null {
  const planId = readString(semanticResult.planId)?.trim()
  const rawSteps = semanticResult.steps
  if (!planId || !Array.isArray(rawSteps) || rawSteps.length === 0) {
    return null
  }

  const normalizedSteps = rawSteps
    .map((rawStep) => normalizeWorkflowStep(rawStep))
    .filter((step): step is WorkflowPlanStep => step !== null)
  if (normalizedSteps.length !== rawSteps.length) {
    return null
  }

  const allStepsCompleted = !normalizedSteps.some((step) => step.status !== 'completed')
  const hasIncompleteSteps = !allStepsCompleted
  return {
    allStepsCompleted,
    hasIncompleteSteps,
    planId,
    steps: normalizedSteps,
    updatedAt: Date.now(),
  }
}

export function resolveWorkflowTurnToolChoice(turnState: ToolExecutionTurnState): 'auto' | 'none' | 'required' {
  const workflowPlan = turnState.workflowPlan
  if (!workflowPlan) {
    return 'auto'
  }

  return 'auto'
}
