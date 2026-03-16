import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createToolExecutionTurnState,
  recordSuccessfulToolExecution,
  resolveWorkflowTurnToolChoice,
} from '../../electron/chat/openaiCompatible/toolExecutionTurnState'
import type { OpenAICompatibleToolCall } from '../../electron/chat/openaiCompatible/toolTypes'

function createUpdatePlanToolCall(): OpenAICompatibleToolCall {
  return {
    argumentsText: '{}',
    id: 'call-update-plan',
    name: 'update_plan',
    startedAt: Date.now(),
  }
}

test('resolveWorkflowTurnToolChoice requires tool usage before any plan is set', () => {
  const turnState = createToolExecutionTurnState()
  assert.equal(resolveWorkflowTurnToolChoice(turnState), 'required')
})

test('resolveWorkflowTurnToolChoice returns required when a plan still has incomplete steps', () => {
  const turnState = createToolExecutionTurnState()
  recordSuccessfulToolExecution(
    createUpdatePlanToolCall(),
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

  assert.equal(resolveWorkflowTurnToolChoice(turnState), 'required')
})

test('resolveWorkflowTurnToolChoice returns none when plan is complete', () => {
  const turnState = createToolExecutionTurnState()
  recordSuccessfulToolExecution(
    createUpdatePlanToolCall(),
    {},
    {
      planId: 'plan-main',
      steps: [{ id: 'step-1', status: 'completed', title: 'Apply patch' }],
    },
    'C:/workspace',
    turnState,
  )

  assert.equal(resolveWorkflowTurnToolChoice(turnState), 'none')
})
