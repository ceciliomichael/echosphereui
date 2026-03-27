import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolInvocationTrace } from '../../src/types/chat'
import { ToolInvocationBlock } from '../../src/components/chat/ToolInvocationBlock'

test('ToolInvocationBlock renders apply_patch diff counts in the tool block', () => {
  const invocation: ToolInvocationTrace = {
    argumentsText: JSON.stringify({ patch: '*** Begin Patch\n*** Update File: src/app.ts\n@@\n-old\n+new\n*** End Patch' }),
    id: 'patch-1',
    resultContent:
      '<tool_result>\n{"schema":"echosphere.tool_result/v1","status":"success","summary":"Updated src/app.ts.","toolCallId":"call-4","toolName":"apply_patch","subject":{"kind":"file","path":"src/app.ts"}}\n</tool_result>',
    resultPresentation: {
      changes: [
        {
          addedLineCount: 1,
          fileName: 'src/app.ts',
          kind: 'update',
          newContent: 'old\nnew\n',
          oldContent: 'old\nold\n',
          removedLineCount: 1,
        },
      ],
      kind: 'file_change_diff',
    },
    startedAt: 1_700_000_000_000,
    state: 'completed',
    toolName: 'apply_patch',
  }

  const markup = renderToStaticMarkup(createElement(ToolInvocationBlock, { invocation }))

  assert.match(markup, /Edited app\.ts/u)
  assert.match(markup, /\+1/u)
  assert.match(markup, /-1/u)
})
