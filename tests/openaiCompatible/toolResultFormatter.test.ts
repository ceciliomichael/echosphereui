import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFailedToolArtifacts,
  buildSuccessfulToolArtifacts,
} from '../../electron/chat/openaiCompatible/toolResultFormatter'
import type { OpenAICompatibleToolCall } from '../../electron/chat/openaiCompatible/toolTypes'

const sampleToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"src"}',
  id: 'tool-call-123',
  name: 'list',
  startedAt: 1_700_000_000_000,
}

test('buildSuccessfulToolArtifacts returns a native tool-role synthetic message', () => {
  const completedAt = 1_700_000_000_100
  const artifacts = buildSuccessfulToolArtifacts(
    sampleToolCall,
    { entries: [{ name: 'src/index.ts' }] },
    sampleToolCall.startedAt,
    completedAt,
  )

  assert.equal(artifacts.syntheticMessage.role, 'tool')
  assert.equal(artifacts.syntheticMessage.toolCallId, sampleToolCall.id)
  assert.equal(artifacts.syntheticMessage.timestamp, completedAt)
  assert.match(artifacts.syntheticMessage.content, /Tool result for list/u)
})

test('buildFailedToolArtifacts returns a native tool-role synthetic message', () => {
  const completedAt = 1_700_000_000_200
  const artifacts = buildFailedToolArtifacts(
    sampleToolCall,
    'Something failed',
    sampleToolCall.startedAt,
    completedAt,
    { code: 'E_FAIL' },
  )

  assert.equal(artifacts.syntheticMessage.role, 'tool')
  assert.equal(artifacts.syntheticMessage.toolCallId, sampleToolCall.id)
  assert.equal(artifacts.syntheticMessage.timestamp, completedAt)
  assert.match(artifacts.syntheticMessage.content, /Tool result for list/u)
})
