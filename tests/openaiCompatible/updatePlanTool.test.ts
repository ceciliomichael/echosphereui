import assert from 'node:assert/strict'
import test from 'node:test'
import { todoWriteTool } from '../../electron/chat/openaiCompatible/tools/update-plan/index'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext() {
  const abortController = new AbortController()
  return {
    agentContextRootPath: 'C:/workspace',
    signal: abortController.signal,
    workspaceCheckpointId: null,
  }
}

test('todo_write tool normalizes valid todo items and returns workflow summary', async () => {
  const result = await todoWriteTool.execute(
    {
      sessionKey: 'plan-main',
      tasks: [
        {
          id: 'step-1',
          status: 'in_progress',
          content: 'Inspect files',
        },
        {
          id: 'step-2',
          status: 'pending',
          content: 'Summarize findings',
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

test('todo_write tool allows multiple in_progress tasks', async () => {
  const result = await todoWriteTool.execute(
    {
      tasks: [
        { id: 'a', status: 'in_progress', content: 'A' },
        { id: 'b', status: 'in_progress', content: 'B' },
      ],
    },
    buildExecutionContext(),
  )

  assert.equal(result.inProgressStepCount, 2)
  assert.equal(result.inProgressStepId, 'a')
  assert.deepEqual(result.inProgressStepIds, ['a', 'b'])
})

test('todo_write tool rejects duplicate task ids', async () => {
  await assert.rejects(
    () =>
      todoWriteTool.execute(
        {
          tasks: [
            { id: 'dup', status: 'pending', content: 'A' },
            { id: 'dup', status: 'completed', content: 'B' },
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

test('todo_write tool accepts a single task object by normalizing it to an array', async () => {
  const result = await todoWriteTool.execute(
    {
      tasks: {
        id: 'single',
        status: 'in_progress',
        content: 'Do work',
      },
    },
    buildExecutionContext(),
  )

  assert.equal(result.totalStepCount, 1)
  assert.equal(result.inProgressStepCount, 1)
  assert.deepEqual(result.inProgressStepIds, ['single'])
})

test('todo_write tool accepts JSON-stringified tasks payloads', async () => {
  const result = await todoWriteTool.execute(
    {
      tasks: '[{"id":"json-step","content":"Parse","status":"pending"}]',
    },
    buildExecutionContext(),
  )

  assert.equal(result.totalStepCount, 1)
  assert.equal(result.pendingStepCount, 1)
})

test('todo_write tool accepts legacy plan-array payload shape with task aliases', async () => {
  const result = await todoWriteTool.execute(
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
