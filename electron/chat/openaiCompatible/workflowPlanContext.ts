import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import type { ToolExecutionTurnState } from './toolExecutionTurnState'

function buildWorkflowPlanContextContent(turnState: ToolExecutionTurnState) {
  const workflowPlan = turnState.workflowPlan
  if (!workflowPlan || workflowPlan.allStepsCompleted) {
    return null
  }

  const lines = ['You have incomplete tasks:']

  for (const step of workflowPlan.steps) {
    if (step.status === 'in_progress') {
      lines.push(`- [in_progress] ${step.id}. ${step.title}`)
      continue
    }

    if (step.status === 'completed') {
      lines.push(`- [completed] ${step.title}`)
      continue
    }

    lines.push(`- [pending] ${step.title}`)
  }

  return lines.join('\n')
}

function buildWorkflowPlanContextMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'user',
    timestamp: Date.now(),
    userMessageKind: 'tool_result',
  }
}

export function appendWorkflowPlanContextMessage(messages: Message[], turnState: ToolExecutionTurnState) {
  const content = buildWorkflowPlanContextContent(turnState)
  if (!content) {
    return messages
  }

  return [...messages, buildWorkflowPlanContextMessage(content)]
}
