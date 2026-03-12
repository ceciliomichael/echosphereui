import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCodexGroupedToolResultContent,
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

const sampleReadToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"tailwind.config.js"}',
  id: 'tool-call-read-123',
  name: 'read',
  startedAt: 1_700_000_000_000,
}

const sampleEditToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"package.json"}',
  id: 'tool-call-edit-123',
  name: 'edit',
  startedAt: 1_700_000_000_000,
}

const sampleWriteToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"src/app/page.tsx"}',
  id: 'tool-call-write-123',
  name: 'write',
  startedAt: 1_700_000_000_000,
}

test('buildSuccessfulToolArtifacts returns a native tool-role synthetic message', () => {
  const completedAt = 1_700_000_000_100
  const artifacts = buildSuccessfulToolArtifacts(
    sampleToolCall,
    { entries: [{ kind: 'file', name: 'src/index.ts' }], path: '.' },
    sampleToolCall.startedAt,
    completedAt,
  )

  assert.equal(artifacts.syntheticMessage.role, 'tool')
  assert.equal(artifacts.syntheticMessage.toolCallId, sampleToolCall.id)
  assert.equal(artifacts.syntheticMessage.timestamp, completedAt)
  assert.match(artifacts.syntheticMessage.content, /Directory \./u)
  assert.match(artifacts.syntheticMessage.content, /[`|]- src\/index\.ts/u)
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
  assert.match(artifacts.syntheticMessage.content, /Tool failed: Something failed/u)
  assert.match(artifacts.syntheticMessage.content, /code: E_FAIL/u)
})

test('buildSuccessfulToolArtifacts annotates read results with a fenced language from the file path', () => {
  const completedAt = 1_700_000_000_150
  const artifacts = buildSuccessfulToolArtifacts(
    sampleReadToolCall,
    {
      content: 'module.exports = {}',
      endLine: 1,
      path: 'tailwind.config.js',
      startLine: 1,
    },
    sampleReadToolCall.startedAt,
    completedAt,
  )

  assert.match(artifacts.syntheticMessage.content, /File tailwind\.config\.js \(lines 1-1\)/u)
  assert.match(artifacts.syntheticMessage.content, /```js/u)
})

test('buildSuccessfulToolArtifacts keeps edit acknowledgements as text while exposing diff presentation data', () => {
  const completedAt = 1_700_000_000_175
  const artifacts = buildSuccessfulToolArtifacts(
    sampleEditToolCall,
    {
      contextLines: 3,
      endLineNumber: 12,
      message: 'Edited package.json successfully.',
      newContent: '{\n  "name": "next"\n}',
      oldContent: '{\n  "name": "prev"\n}',
      path: 'package.json',
      startLineNumber: 10,
    },
    sampleEditToolCall.startedAt,
    completedAt,
  )

  assert.equal(artifacts.syntheticMessage.content, 'Edited package.json successfully.')
  assert.deepEqual(artifacts.resultPresentation, {
    addedLineCount: 1,
    contextLines: 3,
    endLineNumber: 12,
    fileName: 'package.json',
    kind: 'file_diff',
    newContent: '{\n  "name": "next"\n}',
    oldContent: '{\n  "name": "prev"\n}',
    removedLineCount: 1,
    startLineNumber: 10,
  })
})

test('buildSuccessfulToolArtifacts exposes create-file diff presentation for write results', () => {
  const completedAt = 1_700_000_000_180
  const artifacts = buildSuccessfulToolArtifacts(
    sampleWriteToolCall,
    {
      endLineNumber: 4,
      message: 'Created src/app/page.tsx successfully.',
      newContent: 'export default function Page() {\n  return null\n}\n',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
    },
    sampleWriteToolCall.startedAt,
    completedAt,
  )

  assert.equal(artifacts.syntheticMessage.content, 'Created src/app/page.tsx successfully.')
  assert.deepEqual(artifacts.resultPresentation, {
    addedLineCount: 4,
    endLineNumber: 4,
    fileName: 'src/app/page.tsx',
    kind: 'file_diff',
    newContent: 'export default function Page() {\n  return null\n}\n',
    oldContent: null,
    removedLineCount: 0,
    startLineNumber: 1,
  })
})

test('buildCodexGroupedToolResultContent groups same-turn tool outputs into one context block', () => {
  const content = buildCodexGroupedToolResultContent([
    'Directory .\n[F] package.json',
    'File src/index.ts (lines 1-2)\n```\nexport {}\n```',
  ])

  assert.equal(
    content,
    'Tool result context:\n\nDirectory .\n[F] package.json\n\nFile src/index.ts (lines 1-2)\n```\nexport {}\n```',
  )
})
