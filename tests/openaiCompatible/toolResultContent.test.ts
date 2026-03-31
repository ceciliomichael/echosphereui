import assert from 'node:assert/strict'
import test from 'node:test'
import { getToolResultModelContent } from '../../src/lib/toolResultContent'

test('getToolResultModelContent returns only the structured tool body', () => {
  const content = [
    'Acknowledged file read result: Read src/index.ts lines 1-1 of 1 (complete).',
    '<tool_result>',
    JSON.stringify({
      schema: 'echosphere.tool_result/v1',
      status: 'success',
      summary: 'Read src/index.ts lines 1-1 of 1 (complete).',
      toolCallId: 'call-1',
      toolName: 'read',
    }),
    '</tool_result>',
    '<tool_result_body>',
    'export const value = 1;',
    '</tool_result_body>',
  ].join('\n')

  assert.equal(getToolResultModelContent(content), 'export const value = 1;')
})

test('getToolResultModelContent strips legacy wrapper markers when no structured body exists', () => {
  const content = [
    '[SYSTEM TOOL OUTPUT]',
    '<tool_results>',
    '<tool_result>',
    '{"schema":"echosphere.tool_result/v1"}',
    '</tool_result>',
    '</tool_results>',
  ].join('\n')

  assert.equal(getToolResultModelContent(content), '{"schema":"echosphere.tool_result/v1"}')
})
