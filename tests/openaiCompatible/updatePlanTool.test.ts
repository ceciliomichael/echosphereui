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
  assert.equal(result.allStepsCompleted, false)
})

test('update_plan tool rejects multiple in_progress steps', async () => {
  await assert.rejects(
    () =>
      updatePlanTool.execute(
        {
          steps: [
            { id: 'a', status: 'in_progress', title: 'A' },
            { id: 'b', status: 'in_progress', title: 'B' },
          ],
        },
        buildExecutionContext(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAICompatibleToolError)
      assert.match(error.message, /Only one step can be in_progress/u)
      return true
    },
  )
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
