import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpenAICompatibleResponsesLoopState } from '../../electron/chat/openaiCompatible/responsesState'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'

function createToolOutputEvent(
  type: 'tool_invocation_completed' | 'tool_invocation_failed',
  invocationId: string,
  resultContent: string,
): StreamDeltaEvent {
  return {
    argumentsText: '{}',
    completedAt: 1,
    ...(type === 'tool_invocation_failed' ? { errorMessage: 'failed' } : {}),
    invocationId,
    resultContent,
    streamId: 'stream-1',
    syntheticMessage: {
      content: resultContent,
      id: `tool-${invocationId}`,
      role: 'tool',
      timestamp: 1,
      toolCallId: invocationId,
    },
    toolName: 'list',
    type,
  }
}

test('Responses loop state starts without previous_response_id overrides', () => {
  const loopState = createOpenAICompatibleResponsesLoopState()

  assert.deepEqual(loopState.buildRequestOverrides(), {})
  assert.equal(loopState.getPreviousResponseId(), null)
})

test('Responses loop state converts tool completion events into function_call_output follow-up inputs', () => {
  const loopState = createOpenAICompatibleResponsesLoopState()
  loopState.setPreviousResponseId('resp_1')
  loopState.recordStreamEvent(createToolOutputEvent('tool_invocation_completed', 'call_1', '<tool_result>ok</tool_result>'))
  loopState.recordStreamEvent(createToolOutputEvent('tool_invocation_failed', 'call_2', '<tool_result>error</tool_result>'))

  const overrides = loopState.buildRequestOverrides()
  assert.equal(overrides.previousResponseId, 'resp_1')
  assert.deepEqual(overrides.input, [
    {
      call_id: 'call_1',
      output: '<tool_result>ok</tool_result>',
      type: 'function_call_output',
    },
    {
      call_id: 'call_2',
      output: '<tool_result>error</tool_result>',
      type: 'function_call_output',
    },
  ])

  assert.deepEqual(loopState.buildRequestOverrides(), {
    input: [],
    previousResponseId: 'resp_1',
  })
})

test('Responses loop state rebuilds from full message history after file-state tool results', () => {
  const loopState = createOpenAICompatibleResponsesLoopState()
  loopState.setPreviousResponseId('resp_1')
  loopState.recordStreamEvent(
    createToolOutputEvent(
      'tool_invocation_completed',
      'call_read_1',
      JSON.stringify({
        body: 'File src/app.ts (lines 1-2 of 2, complete)',
        metadata: {
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          subject: { kind: 'file', path: 'src/app.ts' },
          summary: 'Updated src/app.ts.',
          toolCallId: 'call_read_1',
          toolName: 'file_change',
        },
        schema: 'echosphere.tool_result/v2',
      }),
    ),
  )

  assert.deepEqual(loopState.buildRequestOverrides(), {})
  assert.deepEqual(loopState.buildRequestOverrides(), {
    input: [],
    previousResponseId: 'resp_1',
  })
})
