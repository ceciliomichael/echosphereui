import assert from 'node:assert/strict'
import test from 'node:test'
import { updatePlanTool } from '../../electron/chat/openaiCompatible/tools/update-plan/index'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext() {
  const abortController = new AbortController()
  return {
    agentContextRootPath: 'C:/workspace',
    signal: abortController.signal,
    workspaceCheckpointId: null,
  }
}

test('update_plan tool normalizes valid workflow steps and returns workflow summary', async () => {
  const result = await updatePlanTool.execute(
    {
      plan: 'plan-main',
      steps: [
        {
          id: 'step-1',
          status: 'in_progress',
          title: 'Inspect files',
        },
        {
          id: 'step-2',
          status: 'pending',
          title: 'Summarize findings',
        },
      ],
    },
    buildExecutionContext(),
  )

  assert.equal(result.planId, 'plan-main')
  assert.equal(result.totalStepCount, 2)
  assert.equal(result.inProgressStepId, 'step-1')
  assert.deepEqual(result.inProgressStepIds, ['step-1'])
  assert.equal(result.allStepsCompleted, false)
})

test('update_plan tool allows multiple in_progress steps', async () => {
  const result = await updatePlanTool.execute(
    {
      steps: [
        { id: 'a', status: 'in_progress', title: 'A' },
        { id: 'b', status: 'in_progress', title: 'B' },
      ],
    },
    buildExecutionContext(),
  )

  assert.equal(result.inProgressStepCount, 2)
  assert.equal(result.inProgressStepId, 'a')
  assert.deepEqual(result.inProgressStepIds, ['a', 'b'])
})

test('update_plan tool rejects duplicate step ids', async () => {
  await assert.rejects(
    () =>
      updatePlanTool.execute(
        {
          steps: [
            { id: 'dup', status: 'pending', title: 'A' },
            { id: 'dup', status: 'completed', title: 'B' },
          ],
        },
        buildExecutionContext(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAICompatibleToolError)
      assert.match(error.message, /unique ids/u)
      return true
    },
  )
})

test('update_plan tool accepts a single step object by normalizing it to an array', async () => {
  const result = await updatePlanTool.execute(
    {
      steps: {
        id: 'single',
        status: 'in_progress',
        title: 'Do work',
      },
    },
    buildExecutionContext(),
  )

  assert.equal(result.totalStepCount, 1)
  assert.equal(result.inProgressStepCount, 1)
  assert.deepEqual(result.inProgressStepIds, ['single'])
})

test('update_plan tool accepts JSON-stringified steps payloads', async () => {
  const result = await updatePlanTool.execute(
    {
      steps: '[{"id":"json-step","title":"Parse","status":"pending"}]',
    },
    buildExecutionContext(),
  )

  assert.equal(result.totalStepCount, 1)
  assert.equal(result.pendingStepCount, 1)
})

test('update_plan tool accepts legacy plan-array payload shape with step aliases', async () => {
  const result = await updatePlanTool.execute(
    {
      plan: [{ step: 'Edit page.tsx', status: 'in_progress' }],
    },
    buildExecutionContext(),
  )

  assert.equal(result.totalStepCount, 1)
  assert.equal(result.inProgressStepCount, 1)
  assert.equal(result.steps[0]?.title, 'Edit page.tsx')
  assert.equal(result.steps[0]?.id, 'edit-page-tsx')
  assert.equal(result.planId, 'default')
})
