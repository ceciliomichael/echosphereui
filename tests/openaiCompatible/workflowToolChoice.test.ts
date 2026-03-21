import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createToolExecutionTurnState,
  recordSuccessfulToolExecution,
  resolveWorkflowTurnToolChoice,
} from '../../electron/chat/openaiCompatible/toolExecutionTurnState'
import type { OpenAICompatibleToolCall } from '../../electron/chat/openaiCompatible/toolTypes'

function createTodoWriteToolCall(): OpenAICompatibleToolCall {
  return {
    argumentsText: '{}',
    id: 'call-todo-write',
    name: 'todo_write',
    startedAt: Date.now(),
  }
}

test('resolveWorkflowTurnToolChoice defaults to auto before any plan is set', () => {
  const turnState = createToolExecutionTurnState()
  assert.equal(resolveWorkflowTurnToolChoice(turnState), 'auto')
})

test('resolveWorkflowTurnToolChoice returns auto when a plan still has incomplete steps', () => {
  const turnState = createToolExecutionTurnState()
  recordSuccessfulToolExecution(
    createTodoWriteToolCall(),
    {},
    {
      planId: 'plan-main',
      steps: [
        { id: 'step-1', status: 'in_progress', title: 'Reason about architecture' },
        { id: 'step-2', status: 'pending', title: 'Apply patch' },
      ],
    },
    'C:/workspace',
    turnState,
  )

  assert.equal(resolveWorkflowTurnToolChoice(turnState), 'auto')
})

test('resolveWorkflowTurnToolChoice returns auto when plan is complete', () => {
  const turnState = createToolExecutionTurnState()
  recordSuccessfulToolExecution(
    createTodoWriteToolCall(),
    {},
    {
      planId: 'plan-main',
      steps: [{ id: 'step-1', status: 'completed', title: 'Apply patch' }],
    },
    'C:/workspace',
    turnState,
  )

  assert.equal(resolveWorkflowTurnToolChoice(turnState), 'auto')
})
