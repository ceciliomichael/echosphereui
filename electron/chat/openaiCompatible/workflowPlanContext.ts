import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import type { ToolExecutionTurnState } from './toolExecutionTurnState'

function buildWorkflowPlanContextContent(turnState: ToolExecutionTurnState) {
  const workflowPlan = turnState.workflowPlan
  const lines = ['Reminder that this is your active todo list, finish them 1 by 1 and also update them 1 by 1:']

  if (!workflowPlan) {
    lines.push('- No active todo list.')
    return lines.join('\n')
  }

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

  if (workflowPlan.steps.length === 0) {
    lines.push('- No active todo list.')
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
  return [...messages, buildWorkflowPlanContextMessage(content)]
}
