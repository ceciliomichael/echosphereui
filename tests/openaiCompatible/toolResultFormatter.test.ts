import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCodexGroupedToolResultContent,
  buildFailedToolArtifacts,
  buildSuccessfulToolArtifacts,
} from '../../electron/chat/openaiCompatible/toolResultFormatter'
import { parseStructuredToolResultContent } from '../../src/lib/toolResultContent'
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

const sampleGlobToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"src","pattern":"**/*.tsx"}',
  id: 'tool-call-glob-123',
  name: 'glob',
  startedAt: 1_700_000_000_000,
}

const sampleGrepToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"src","pattern":"Hero"}',
  id: 'tool-call-grep-123',
  name: 'grep',
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

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)
  assert.equal(artifacts.syntheticMessage.role, 'tool')
  assert.equal(artifacts.syntheticMessage.toolCallId, sampleToolCall.id)
  assert.equal(artifacts.syntheticMessage.timestamp, completedAt)
  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged directory inspection result: Listed \. with 1 visible entry\./iu,
  )
  assert.equal(parsedContent.metadata?.toolName, 'list')
  assert.equal(parsedContent.metadata?.status, 'success')
  assert.match(parsedContent.metadata?.summary ?? '', /Listed \./u)
  assert.equal(parsedContent.metadata?.semantics?.authoritative, true)
  assert.match(parsedContent.body ?? '', /Directory \./u)
  assert.match(parsedContent.body ?? '', /└─ src\/index\.ts/u)
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

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)
  assert.equal(artifacts.syntheticMessage.role, 'tool')
  assert.equal(artifacts.syntheticMessage.toolCallId, sampleToolCall.id)
  assert.equal(artifacts.syntheticMessage.timestamp, completedAt)
  assert.match(artifacts.syntheticMessage.content, /^Acknowledged tool failure: Something failed\./iu)
  assert.equal(parsedContent.metadata?.toolName, 'list')
  assert.equal(parsedContent.metadata?.status, 'error')
  assert.equal(parsedContent.metadata?.summary, 'Something failed')
  assert.match(parsedContent.body ?? '', /Tool failed: Something failed/u)
  assert.match(parsedContent.body ?? '', /code: E_FAIL/u)
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

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged file read result: Read tailwind\.config\.js lines 1-1\./iu,
  )
  assert.match(parsedContent.body ?? '', /File tailwind\.config\.js \(lines 1-1\)/u)
  assert.match(parsedContent.body ?? '', /```js/u)
  assert.equal(parsedContent.metadata?.semantics?.start_line, 1)
  assert.equal(parsedContent.metadata?.semantics?.end_line, 1)
})

test('buildSuccessfulToolArtifacts adds direct acknowledgements for glob and grep results', () => {
  const globArtifacts = buildSuccessfulToolArtifacts(
    sampleGlobToolCall,
    {
      matchCount: 2,
      matches: ['src/app/page.tsx', 'src/components/Hero.tsx'],
      path: 'src',
      pattern: '**/*.tsx',
    },
    sampleGlobToolCall.startedAt,
    sampleGlobToolCall.startedAt + 1,
  )
  const grepArtifacts = buildSuccessfulToolArtifacts(
    sampleGrepToolCall,
    {
      matchCount: 1,
      matches: [{ columnNumber: 16, lineNumber: 4, lineText: 'export function Hero() {}', path: 'src/components/Hero.tsx' }],
      path: 'src',
      pattern: 'Hero',
    },
    sampleGrepToolCall.startedAt,
    sampleGrepToolCall.startedAt + 1,
  )

  assert.match(
    globArtifacts.syntheticMessage.content,
    /^Acknowledged path search result: Found 2 path matches for \*\*\/\*\.tsx in src\./iu,
  )
  assert.match(
    grepArtifacts.syntheticMessage.content,
    /^Acknowledged content search result: Found 1 search hit for Hero in src\./iu,
  )
})

test('buildSuccessfulToolArtifacts keeps edit acknowledgements as text while exposing diff presentation data', () => {
  const completedAt = 1_700_000_000_175
  const artifacts = buildSuccessfulToolArtifacts(
    sampleEditToolCall,
    {
      contentChanged: true,
      contextLines: 3,
      endLineNumber: 12,
      message: 'Edited package.json successfully.',
      newContent: '{\n  "name": "next"\n}',
      oldContent: '{\n  "name": "prev"\n}',
      operation: 'edit',
      path: 'package.json',
      replacementCount: 1,
      startLineNumber: 10,
      targetKind: 'file',
    },
    sampleEditToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged workspace state: package\.json was edited successfully and now reflects the applied changes\./iu,
  )
  assert.equal(parsedContent.body, 'Edited package.json successfully.')
  assert.equal(parsedContent.metadata?.semantics?.operation, 'edit')
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
      contentChanged: true,
      endLineNumber: 4,
      message: 'Created src/app/page.tsx successfully.',
      newContent: 'export default function Page() {\n  return null\n}\n',
      operation: 'create',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleWriteToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged workspace state: src\/app\/page\.tsx was created successfully and now exists in the workspace\./iu,
  )
  assert.equal(parsedContent.body, 'Created src/app/page.tsx successfully.')
  assert.equal(parsedContent.metadata?.semantics?.operation, 'create')
  assert.equal(parsedContent.metadata?.semantics?.workspace_effect, 'file_created')
  assert.equal(parsedContent.metadata?.semantics?.mutation_applied, true)
  assert.equal(parsedContent.metadata?.semantics?.target_exists_after_call, true)
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
  const listContent = buildSuccessfulToolArtifacts(
    sampleToolCall,
    { entries: [{ kind: 'file', name: 'package.json' }], entryCount: 1, path: '.' },
    sampleToolCall.startedAt,
    sampleToolCall.startedAt + 1,
  ).resultContent
  const readContent = buildSuccessfulToolArtifacts(
    sampleReadToolCall,
    {
      content: 'export {}',
      endLine: 2,
      lineCount: 2,
      path: 'src/index.ts',
      startLine: 1,
    },
    sampleReadToolCall.startedAt,
    sampleReadToolCall.startedAt + 2,
  ).resultContent
  const content = buildCodexGroupedToolResultContent([
    listContent,
    readContent,
  ])

  assert.match(content ?? '', /Authoritative tool results from the immediately preceding tool calls\./u)
  assert.match(content ?? '', /For each mutated path, the latest successful mutation below is the current workspace state\./u)
  assert.match(content ?? '', /Acknowledged tool result summaries:/u)
  assert.match(content ?? '', /- list success: Listed \. with 1 visible entry\./u)
  assert.match(content ?? '', /- read success: Read src\/index\.ts lines 1-2\./u)
  assert.match(content ?? '', /<tool_result>/u)
  assert.match(content ?? '', /"toolName": "list"/u)
  assert.match(content ?? '', /"toolName": "read"/u)
})

test('buildCodexGroupedToolResultContent includes latest mutation state summary for repeated file writes', () => {
  const createContent = buildSuccessfulToolArtifacts(
    sampleWriteToolCall,
    {
      contentChanged: true,
      endLineNumber: 2,
      message: 'Created src/app/page.tsx successfully.',
      newContent: 'export default function Page() {\n  return null\n}\n',
      operation: 'create',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleWriteToolCall.startedAt,
    sampleWriteToolCall.startedAt + 1,
  ).resultContent
  const overwriteContent = buildSuccessfulToolArtifacts(
    sampleWriteToolCall,
    {
      contentChanged: true,
      endLineNumber: 3,
      message: 'Overwrote src/app/page.tsx successfully.',
      newContent: 'export default function Page() {\n  return <main />\n}\n',
      oldContent: 'export default function Page() {\n  return null\n}\n',
      operation: 'overwrite',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleWriteToolCall.startedAt + 2,
    sampleWriteToolCall.startedAt + 3,
  ).resultContent
  const content = buildCodexGroupedToolResultContent([
    createContent,
    overwriteContent,
  ])

  assert.match(content ?? '', /Latest acknowledged workspace file state:/u)
  assert.match(content ?? '', /- src\/app\/page\.tsx now reflects the latest successful write content\./u)
})
