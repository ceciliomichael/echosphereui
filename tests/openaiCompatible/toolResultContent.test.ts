import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolResultModelContent } from '../../src/lib/toolResultContent'

test('getToolResultModelContent returns only the structured tool body', () => {
  const content = JSON.stringify({
    body: 'Directory src\n└─ index.ts',
    metadata: {
      schema: 'echosphere.tool_result/v1',
      status: 'success',
      summary: 'Listed src with 1 visible entry.',
      toolCallId: 'call-1',
      toolName: 'list',
    },
    schema: 'echosphere.tool_result/v2',
  })

  assert.equal(getToolResultModelContent(content), 'Directory src\n└─ index.ts')
})

test('getToolResultModelContent falls back to the structured tool summary when no body exists', () => {
  const content = JSON.stringify({
    metadata: {
      schema: 'echosphere.tool_result/v1',
      status: 'success',
      summary: 'Listed src with 1 visible entry.',
      toolCallId: 'call-1',
      toolName: 'list',
    },
    schema: 'echosphere.tool_result/v2',
  })

  assert.equal(getToolResultModelContent(content), 'Listed src with 1 visible entry.')
})
