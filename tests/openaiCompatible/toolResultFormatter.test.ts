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

const sampleEditCreateToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"path":"src/app/page.tsx"}',
  id: 'tool-call-edit-create-123',
  name: 'edit',
  startedAt: 1_700_000_000_000,
}

const sampleWriteCreateToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"absolute_path":"C:\\\\repo\\\\src\\\\app\\\\page.tsx","content":"export default function Page() {\\n  return null\\n}\\n"}',
  id: 'tool-call-write-create-123',
  name: 'write',
  startedAt: 1_700_000_000_000,
}

const sampleFileChangeToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"changes":[{"path":"src/components/ProvidersSettingsPanel.tsx","kind":"update"},{"path":"src/components/SettingsSidebar.tsx","kind":"add"}]}',
  id: 'tool-call-file-change-123',
  name: 'file_change',
  startedAt: 1_700_000_000_000,
}

const sampleExecToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"cmd":"npm test"}',
  id: 'tool-call-exec-123',
  name: 'run_terminal',
  startedAt: 1_700_000_000_000,
}

const sampleWriteStdinToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"session_id":77,"chars":"\\n"}',
  id: 'tool-call-write-stdin-123',
  name: 'get_terminal_output',
  startedAt: 1_700_000_000_000,
}

test('buildSuccessfulToolArtifacts returns a native tool-role synthetic message', () => {
  const completedAt = 1_700_000_000_100
  const artifacts = buildSuccessfulToolArtifacts(
    sampleToolCall,
    { absolutePath: '/workspace/src', entries: [{ kind: 'file', name: 'src/index.ts' }], path: '.' },
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
  assert.equal(parsedContent.metadata?.semantics?.absolute_path, '/workspace/src')
  assert.match(parsedContent.body ?? '', /Directory \./u)
  assert.match(parsedContent.body ?? '', /└─ src\/index\.ts/u)
})

test('buildSuccessfulToolArtifacts keeps list display paths relative while exposing absolute path metadata', () => {
  const completedAt = 1_700_000_000_105
  const artifacts = buildSuccessfulToolArtifacts(
    sampleToolCall,
    {
      absolutePath: '/workspace/src/app/components',
      entries: [{ kind: 'file', name: 'component-name.tsx' }],
      entryCount: 1,
      path: 'src/app/components',
      totalVisibleEntryCount: 1,
    },
    sampleToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.equal(parsedContent.metadata?.semantics?.absolute_path, '/workspace/src/app/components')
  assert.equal(parsedContent.metadata?.subject?.path, 'src/app/components')
  assert.match(parsedContent.body ?? '', /Directory src\/app\/components/u)
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
      maxReadLineCount: 500,
      path: 'tailwind.config.js',
      startLine: 1,
      totalLineCount: 1,
    },
    sampleReadToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged file read result: Read tailwind\.config\.js lines 1-1 of 1 \(complete\)\./iu,
  )
  assert.match(parsedContent.body ?? '', /File tailwind\.config\.js \(lines 1-1 of 1, complete\)/u)
  assert.match(parsedContent.body ?? '', /```js/u)
  assert.match(parsedContent.body ?? '', /module\.exports = \{\}/u)
  assert.doesNotMatch(parsedContent.body ?? '', /line_number \| text/u)
  assert.doesNotMatch(parsedContent.body ?? '', /^\s*\d+\s*\|/m)
  assert.equal(parsedContent.metadata?.semantics?.fully_read, true)
  assert.equal(parsedContent.metadata?.semantics?.start_line, 1)
  assert.equal(parsedContent.metadata?.semantics?.end_line, 1)
  assert.equal(parsedContent.metadata?.semantics?.total_line_count, 1)
  assert.equal(parsedContent.metadata?.semantics?.max_read_line_count, 500)
})

test('buildSuccessfulToolArtifacts keeps truncated read continuation data in structured metadata without extra prose', () => {
  const artifacts = buildSuccessfulToolArtifacts(
    sampleReadToolCall,
    {
      content: 'line-1\nline-2',
      endLine: 2,
      hasMoreLines: true,
      lineCount: 2,
      maxReadLineCount: 2,
      nextEndLine: 4,
      nextStartLine: 3,
      path: 'tailwind.config.js',
      remainingLineCount: 2,
      startLine: 1,
      totalLineCount: 4,
      truncated: true,
    },
    sampleReadToolCall.startedAt,
    sampleReadToolCall.startedAt + 1,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)
  assert.match(
    parsedContent.metadata?.summary ?? '',
    /Read tailwind\.config\.js lines 1-2 of 4 \(partial, 2 lines remaining\)\./u,
  )
  assert.match(parsedContent.body ?? '', /File tailwind\.config\.js \(lines 1-2 of 4, partial, 2 lines remaining\)/u)
  assert.doesNotMatch(parsedContent.body ?? '', /Results truncated\./u)
  assert.doesNotMatch(parsedContent.body ?? '', /Next recommended read range/u)
  assert.equal(parsedContent.metadata?.semantics?.fully_read, false)
  assert.equal(parsedContent.metadata?.semantics?.has_more_lines, true)
  assert.equal(parsedContent.metadata?.semantics?.remaining_line_count, 2)
  assert.equal(parsedContent.metadata?.semantics?.next_start_line, 3)
  assert.equal(parsedContent.metadata?.semantics?.next_end_line, 4)
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
      addedPaths: [],
      contentChanged: true,
      contextLines: 3,
      deletedPaths: [],
      endLineNumber: 12,
      message: 'Edited package.json successfully.',
      modifiedPaths: ['package.json'],
      newContent: '{\n  "name": "next"\n}',
      oldContent: '{\n  "name": "prev"\n}',
      operation: 'edit',
      path: 'package.json',
      startLineNumber: 10,
      targetKind: 'file',
    },
    sampleEditToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged workspace state: package\.json was edited successfully and now reflects the applied changes\. Trust this result as the current workspace state for that path\./iu,
  )
  assert.match(
    parsedContent.metadata?.summary ?? '',
    /Applied edits to package\.json\. The current workspace state for this path is included below and should be treated as authoritative\./u,
  )
  assert.match(parsedContent.body ?? '', /^Edited package\.json successfully\./u)
  assert.match(parsedContent.body ?? '', /Current workspace state for package\.json is authoritative\./u)
  assert.match(parsedContent.body ?? '', /Changed paths: package\.json/u)
  assert.match(parsedContent.body ?? '', /Current content of package\.json:/u)
  assert.match(parsedContent.body ?? '', /```json/u)
  assert.match(parsedContent.body ?? '', /"name": "next"/u)
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

test('buildSuccessfulToolArtifacts exposes create-file diff presentation for edit results', () => {
  const completedAt = 1_700_000_000_180
  const artifacts = buildSuccessfulToolArtifacts(
    sampleEditCreateToolCall,
    {
      addedPaths: ['src/app/page.tsx'],
      changeCount: 1,
      contentChanged: true,
      deletedPaths: [],
      endLineNumber: 4,
      message: 'Created src/app/page.tsx successfully.',
      modifiedPaths: [],
      newContent: 'export default function Page() {\n  return null\n}\n',
      oldContent: null,
      operation: 'edit',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleEditCreateToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(
    artifacts.syntheticMessage.content,
    /^Acknowledged workspace state: src\/app\/page\.tsx was edited successfully and now reflects the applied changes\. Trust this result as the current workspace state for that path\./iu,
  )
  assert.match(
    parsedContent.metadata?.summary ?? '',
    /Applied edits to src\/app\/page\.tsx\. The current workspace state for this path is included below and should be treated as authoritative\./u,
  )
  assert.match(parsedContent.body ?? '', /^Created src\/app\/page\.tsx successfully\./u)
  assert.match(parsedContent.body ?? '', /Current workspace state for src\/app\/page\.tsx is authoritative\./u)
  assert.match(parsedContent.body ?? '', /Changed paths: src\/app\/page\.tsx/u)
  assert.match(parsedContent.body ?? '', /Current content of src\/app\/page\.tsx:/u)
  assert.match(parsedContent.body ?? '', /```tsx/u)
  assert.equal(parsedContent.metadata?.semantics?.operation, 'edit')
  assert.equal(parsedContent.metadata?.semantics?.workspace_effect, 'files_edited')
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

test('buildSuccessfulToolArtifacts preserves multiline create-file bodies for write results', () => {
  const completedAt = 1_700_000_000_181
  const artifacts = buildSuccessfulToolArtifacts(
    sampleWriteCreateToolCall,
    {
      addedPaths: ['src/app/page.tsx'],
      contentChanged: true,
      deletedPaths: [],
      message: 'Created src/app/page.tsx successfully.',
      modifiedPaths: [],
      newContent: 'export default function Page() {\n  return null\n}\n',
      oldContent: null,
      operation: 'write',
      path: 'src/app/page.tsx',
      targetKind: 'file',
    },
    sampleWriteCreateToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(parsedContent.body ?? '', /Current content of src\/app\/page\.tsx:/u)
  assert.match(parsedContent.body ?? '', /```tsx/u)
  assert.match(parsedContent.body ?? '', /export default function Page\(\) \{/u)
  assert.match(parsedContent.body ?? '', /  return null/u)
  assert.match(parsedContent.body ?? '', /\n```$/u)
  assert.equal(artifacts.resultPresentation?.kind, 'file_diff')
  if (artifacts.resultPresentation?.kind === 'file_diff') {
    assert.equal(artifacts.resultPresentation.fileName, 'src/app/page.tsx')
    assert.equal(artifacts.resultPresentation.newContent, 'export default function Page() {\n  return null\n}\n')
  }
})

test('buildSuccessfulToolArtifacts exposes multi-file diff presentation for file_change results', () => {
  const completedAt = 1_700_000_000_185
  const artifacts = buildSuccessfulToolArtifacts(
    sampleFileChangeToolCall,
    {
      added_path_count: 1,
      changes: [
        {
          addedLineCount: 0,
          fileName: 'src/components/ProvidersSettingsPanel.tsx',
          kind: 'update',
          newContent: 'export const x = 1;\n',
          oldContent: 'export const x = 0;\n',
          removedLineCount: 0,
        },
        {
          addedLineCount: 2,
          fileName: 'src/components/SettingsSidebar.tsx',
          kind: 'add',
          newContent: 'export function SettingsSidebar() {\n  return null\n}\n',
          oldContent: null,
          removedLineCount: 0,
        },
      ],
      contentChanged: true,
      deleted_path_count: 0,
      message: 'Updated 2 files.',
      modified_path_count: 1,
      operation: 'file_change',
      path: 'src/components/ProvidersSettingsPanel.tsx',
      targetKind: 'file',
    },
    sampleFileChangeToolCall.startedAt,
    completedAt,
  )

  const parsedContent = parseStructuredToolResultContent(artifacts.syntheticMessage.content)

  assert.match(parsedContent.metadata?.summary ?? '', /Updated 2 files\./u)
  assert.equal(parsedContent.metadata?.semantics?.operation, 'file_change')
  assert.equal(artifacts.resultPresentation?.kind, 'file_change_diff')
  if (artifacts.resultPresentation?.kind === 'file_change_diff') {
    assert.equal(artifacts.resultPresentation.changes.length, 2)
    assert.equal(artifacts.resultPresentation.changes[0]?.fileName, 'src/components/ProvidersSettingsPanel.tsx')
    assert.equal(artifacts.resultPresentation.changes[1]?.kind, 'add')
  }
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
      hasMoreLines: false,
      lineCount: 2,
      path: 'src/index.ts',
      startLine: 1,
      totalLineCount: 2,
    },
    sampleReadToolCall.startedAt,
    sampleReadToolCall.startedAt + 2,
  ).resultContent
  const content = buildCodexGroupedToolResultContent([
    listContent,
    readContent,
  ])

  assert.match(content ?? '', /Authoritative tool results from the immediately preceding tool calls\./u)
  assert.match(content ?? '', /Reuse the latest inspection state below before repeating the same inspection tool call\./u)
  assert.match(content ?? '', /A read marked fully read already covers the whole file unless the workspace changed\./u)
  assert.match(content ?? '', /For each mutated path, the latest successful mutation below is the current workspace state\./u)
  assert.match(content ?? '', /Acknowledged tool result summaries:/u)
  assert.match(content ?? '', /Latest acknowledged inspection state\./u)
  assert.match(content ?? '', /- \. was last listed with 1 visible entry\./u)
  assert.match(content ?? '', /- src\/index\.ts was fully read at lines 1-2 of 2\./u)
  assert.match(content ?? '', /- list success: Listed \. with 1 visible entry\./u)
  assert.match(content ?? '', /- read success: Read src\/index\.ts lines 1-2 of 2 \(complete\)\./u)
  assert.match(content ?? '', /<tool_result>/u)
  assert.match(content ?? '', /"toolName": "list"/u)
  assert.match(content ?? '', /"toolName": "read"/u)
})

test('buildCodexGroupedToolResultContent includes latest mutation state summary for repeated file edits', () => {
  const createContent = buildSuccessfulToolArtifacts(
    sampleEditCreateToolCall,
    {
      addedPaths: ['src/app/page.tsx'],
      changeCount: 1,
      contentChanged: true,
      deletedPaths: [],
      endLineNumber: 2,
      message: 'Created src/app/page.tsx successfully.',
      modifiedPaths: [],
      newContent: 'export default function Page() {\n  return null\n}\n',
      oldContent: null,
      operation: 'edit',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleEditCreateToolCall.startedAt,
    sampleEditCreateToolCall.startedAt + 1,
  ).resultContent
  const patchUpdateContent = buildSuccessfulToolArtifacts(
    sampleEditCreateToolCall,
    {
      addedPaths: [],
      changeCount: 1,
      contentChanged: true,
      deletedPaths: [],
      endLineNumber: 3,
      message: 'Edited src/app/page.tsx successfully.',
      modifiedPaths: ['src/app/page.tsx'],
      newContent: 'export default function Page() {\n  return <main />\n}\n',
      oldContent: 'export default function Page() {\n  return null\n}\n',
      operation: 'edit',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleEditCreateToolCall.startedAt + 2,
    sampleEditCreateToolCall.startedAt + 3,
  ).resultContent
  const content = buildCodexGroupedToolResultContent([
    createContent,
    patchUpdateContent,
  ])

  assert.match(content ?? '', /Latest acknowledged workspace file state:/u)
  assert.match(content ?? '', /- src\/app\/page\.tsx now reflects the latest successful edit changes\./u)
})

test('buildCodexGroupedToolResultContent preserves large edit bodies without clipping them', () => {
  const largeNewContent = Array.from({ length: 240 }, (_, index) => `line-${index + 1} ${'x'.repeat(20)}`).join('\n')
  const content = buildSuccessfulToolArtifacts(
    sampleEditCreateToolCall,
    {
      addedPaths: ['src/app/page.tsx'],
      changeCount: 1,
      contentChanged: true,
      deletedPaths: [],
      endLineNumber: 240,
      message: 'Created src/app/page.tsx successfully.',
      modifiedPaths: [],
      newContent: largeNewContent,
      oldContent: null,
      operation: 'edit',
      path: 'src/app/page.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    sampleEditCreateToolCall.startedAt,
    sampleEditCreateToolCall.startedAt + 10,
  ).resultContent

  const groupedContent = buildCodexGroupedToolResultContent([content])

  assert.match(groupedContent ?? '', /line-1 x{20}/u)
  assert.match(groupedContent ?? '', /line-240 x{20}/u)
  assert.doesNotMatch(groupedContent ?? '', /\[tool replay context clipped to reduce context growth\]/u)
})

test('buildCodexGroupedToolResultContent compacts replay terminal bodies and keeps only latest terminal session output', () => {
  const repeatedOutput = 'line output\n'.repeat(400)
  const startedSessionContent = buildSuccessfulToolArtifacts(
    sampleExecToolCall,
    {
      executionMode: 'full',
      exitCode: null,
      message: 'Started terminal run in full mode with session 77.',
      operation: 'run_terminal',
      originalTokenCount: 5_000,
      output: repeatedOutput,
      path: '.',
      processId: 77,
      targetKind: 'directory',
    },
    sampleExecToolCall.startedAt,
    sampleExecToolCall.startedAt + 1,
  ).resultContent
  const latestSessionContent = buildSuccessfulToolArtifacts(
    sampleWriteStdinToolCall,
    {
      exitCode: 0,
      message: 'Fetched terminal output for session 77. Process exited with code 0.',
      operation: 'get_terminal_output',
      originalTokenCount: 3_000,
      output: repeatedOutput,
      path: '.',
      processId: null,
      sessionId: 77,
      targetKind: 'terminal',
    },
    sampleWriteStdinToolCall.startedAt,
    sampleWriteStdinToolCall.startedAt + 1,
  ).resultContent

  const groupedContent = buildCodexGroupedToolResultContent([startedSessionContent, latestSessionContent])
  assert.ok(groupedContent)
  assert.match(groupedContent ?? '', /get_terminal_output success: Fetched terminal output for session 77 \(exit code 0\)\./u)
  assert.match(groupedContent ?? '', /\[terminal replay context clipped to reduce context growth/u)
  assert.equal((groupedContent ?? '').split('"toolName": "run_terminal"').length - 1, 0)
  assert.equal((groupedContent ?? '').split('"toolName": "get_terminal_output"').length - 1, 1)
})
