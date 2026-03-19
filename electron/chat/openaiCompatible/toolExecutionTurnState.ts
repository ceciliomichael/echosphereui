import type { Message } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from './toolTypes'

type WorkflowStepStatus = 'completed' | 'in_progress' | 'pending'

interface WorkflowPlanStep {
  id: string
  status: WorkflowStepStatus
  title: string
}

interface WorkflowPlanState {
  allStepsCompleted: boolean
  hasIncompleteSteps: boolean
  planId: string
  steps: WorkflowPlanStep[]
  updatedAt: number
}

export interface ToolExecutionTurnState {
  readonly initialized: true
  workflowPlan: WorkflowPlanState | null
}

export function createToolExecutionTurnState(): ToolExecutionTurnState {
  return {
    initialized: true,
    workflowPlan: null,
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

export function resolveWorkflowTurnToolChoice(_turnState: ToolExecutionTurnState): 'auto' {
  void _turnState
  return 'auto'
}
