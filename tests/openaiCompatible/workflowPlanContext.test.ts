import assert from 'node:assert/strict'
import test from 'node:test'
import type { Message } from '../../src/types/chat'
import { appendWorkflowPlanContextMessage } from '../../electron/chat/openaiCompatible/workflowPlanContext'
import { createToolExecutionTurnState, recordSuccessfulToolExecution } from '../../electron/chat/openaiCompatible/toolExecutionTurnState'
import type { OpenAICompatibleToolCall } from '../../electron/chat/openaiCompatible/toolTypes'

function createUpdatePlanToolCall(): OpenAICompatibleToolCall {
  return {
    argumentsText: '{}',
    id: 'plan-call',
    name: 'update_plan',
    startedAt: Date.now(),
  }
}

function createAssistantMessage(content: string): Message {
  return {
    content,
    id: 'assistant-1',
    role: 'assistant',
    timestamp: Date.now(),
  }
}

test('appendWorkflowPlanContextMessage appends task list while plan has incomplete steps', () => {
  const turnState = createToolExecutionTurnState()
  recordSuccessfulToolExecution(
    createUpdatePlanToolCall(),
    {},
    {
      planId: 'plan-main',
      steps: [
        { id: 's1', status: 'in_progress', title: 'Inspect workspace files' },
        { id: 's2', status: 'pending', title: 'Apply edits' },
      ],
    },
    'C:/workspace',
    turnState,
  )

  const baseMessages = [createAssistantMessage('Working...')]
  const messagesWithWorkflow = appendWorkflowPlanContextMessage(baseMessages, turnState)
  assert.equal(messagesWithWorkflow.length, 2)
  const appended = messagesWithWorkflow[1]
  assert.equal(appended?.role, 'user')
  assert.match(appended?.content ?? '', /You have incomplete tasks:/u)
  assert.match(appended?.content ?? '', /\[in_progress\] s1\. Inspect workspace files/u)
  assert.match(appended?.content ?? '', /\[pending\] Apply edits/u)
})

test('appendWorkflowPlanContextMessage does not append task list when all plan steps are completed', () => {
  const turnState = createToolExecutionTurnState()
  recordSuccessfulToolExecution(
    createUpdatePlanToolCall(),
    {},
    {
      planId: 'plan-main',
      steps: [{ id: 's1', status: 'completed', title: 'Apply edits' }],
    },
    'C:/workspace',
    turnState,
  )

  const baseMessages = [createAssistantMessage('Done.')]
  const messagesWithWorkflow = appendWorkflowPlanContextMessage(baseMessages, turnState)
  assert.equal(messagesWithWorkflow.length, 1)
})
