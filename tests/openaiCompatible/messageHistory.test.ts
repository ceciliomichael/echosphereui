import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplayableMessageHistory } from '../../electron/chat/openaiCompatible/messageHistory'
import {
  TOOL_OUTPUT_PREFIX,
  TOOL_RESULT_TO_USER_BRIDGE_TEXT,
  TOOL_RESULTS_TAG_CLOSE,
  TOOL_RESULTS_TAG_OPEN,
} from '../../electron/chat/openaiCompatible/toolResultReplayEnvelope'
import { buildSuccessfulToolArtifacts } from '../../electron/chat/openaiCompatible/toolResultFormatter'
import { buildCodexInputMessages } from '../../electron/chat/providers/codexRuntime'
import type { Message } from '../../src/types/chat'
import type { OpenAICompatibleToolCall } from '../../electron/chat/openaiCompatible/toolTypes'

const sampleListToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"absolute_path":"C:/workspace"}',
  id: 'call-1',
  name: 'list',
  startedAt: 1_700_000_000_010,
}

const sampleReadToolCall: OpenAICompatibleToolCall = {
  argumentsText: '{"absolute_path":"C:/workspace/package.json"}',
  id: 'call-2',
  name: 'read',
  startedAt: 1_700_000_000_020,
}

test('buildReplayableMessageHistory emits standalone user tool-result context with assistant bridge before the next user turn', () => {
  const listResult = buildSuccessfulToolArtifacts(
    sampleListToolCall,
    {
      entries: [{ kind: 'directory', name: 'src' }, { kind: 'file', name: 'package.json' }],
      entryCount: 2,
      path: '.',
      targetKind: 'directory',
      totalVisibleEntryCount: 2,
    },
    sampleListToolCall.startedAt,
    sampleListToolCall.startedAt,
  )
  const readResult = buildSuccessfulToolArtifacts(
    sampleReadToolCall,
    {
      content: '{}',
      endLine: 3,
      lineCount: 3,
      path: 'package.json',
      startLine: 1,
      totalLineCount: 3,
      targetKind: 'file',
    },
    sampleReadToolCall.startedAt,
    sampleReadToolCall.startedAt,
  )
  const messages: Message[] = [
    {
      content: 'I checked the repo.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
    {
      content: listResult.resultContent,
      id: 'tool-1',
      role: 'tool',
      timestamp: 1_700_000_000_010,
      toolCallId: 'call-1',
    },
    {
      content: readResult.resultContent,
      id: 'tool-2',
      role: 'tool',
      timestamp: 1_700_000_000_020,
      toolCallId: 'call-2',
    },
    {
      content: 'What did you find?',
      id: 'user-1',
      role: 'user',
      timestamp: 1_700_000_000_030,
    },
  ]

  const replayableMessages = buildReplayableMessageHistory(messages)

  assert.equal(replayableMessages.length, 4)
  assert.equal(replayableMessages[0]?.role, 'assistant')
  assert.equal(replayableMessages[1]?.role, 'user')
  assert.equal(replayableMessages[1]?.userMessageKind, 'tool_result')
  assert.match(replayableMessages[1]?.content ?? '', /^\[SYSTEM TOOL OUTPUT\]/u)
  assert.match(replayableMessages[1]?.content ?? '', /<tool_results>/u)
  assert.match(replayableMessages[1]?.content ?? '', /Authoritative tool results from the immediately preceding tool calls\./u)
  assert.match(replayableMessages[1]?.content ?? '', /Reuse the latest inspection state below before repeating the same inspection tool call\./u)
  assert.match(
    replayableMessages[1]?.content ?? '',
    /For each mutated path, the latest successful mutation below is the current workspace state\./u,
  )
  assert.match(replayableMessages[1]?.content ?? '', /Acknowledged tool result summaries:/u)
  assert.match(replayableMessages[1]?.content ?? '', /Latest acknowledged inspection state\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- \. was last listed with 2 visible entries\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- package\.json was fully read at lines 1-3 of 3\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- list success: Listed \. with 2 visible entries\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- read success: Read package\.json lines 1-3 of 3 \(complete\)\./u)
  assert.match(replayableMessages[1]?.content ?? '', /"toolName": "list"/u)
  assert.match(replayableMessages[1]?.content ?? '', /"toolName": "read"/u)
  assert.equal(replayableMessages[1]?.timestamp, 1_700_000_000_020)
  assert.equal(replayableMessages[2]?.role, 'assistant')
  assert.equal(replayableMessages[2]?.content, TOOL_RESULT_TO_USER_BRIDGE_TEXT)
  assert.equal(replayableMessages[3]?.role, 'user')
  assert.equal(replayableMessages[3]?.content, 'What did you find?')
  assert.equal(replayableMessages[3]?.timestamp, 1_700_000_000_030)
  assert.equal(replayableMessages.some((message) => message.role === 'tool'), false)
})

test('buildReplayableMessageHistory preserves large read bodies and distinct ranges for the same file', () => {
  const firstReadContent = Array.from({ length: 150 }, (_, index) => `first-range-line-${index + 1}`).join('\n')
  const secondReadContent = Array.from({ length: 150 }, (_, index) => `second-range-line-${index + 1}`).join('\n')

  const firstReadResult = buildSuccessfulToolArtifacts(
    sampleReadToolCall,
    {
      content: firstReadContent,
      endLine: 150,
      hasMoreLines: true,
      lineCount: 150,
      path: 'package.json',
      remainingLineCount: 150,
      startLine: 1,
      totalLineCount: 300,
      targetKind: 'file',
    },
    sampleReadToolCall.startedAt,
    sampleReadToolCall.startedAt + 1,
  )
  const secondReadResult = buildSuccessfulToolArtifacts(
    {
      ...sampleReadToolCall,
      id: 'call-3',
      startedAt: sampleReadToolCall.startedAt + 2,
    },
    {
      content: secondReadContent,
      endLine: 300,
      hasMoreLines: false,
      lineCount: 150,
      path: 'package.json',
      remainingLineCount: 0,
      startLine: 151,
      totalLineCount: 300,
      targetKind: 'file',
    },
    sampleReadToolCall.startedAt + 2,
    sampleReadToolCall.startedAt + 3,
  )

  const replayableMessages = buildReplayableMessageHistory([
    firstReadResult.syntheticMessage,
    secondReadResult.syntheticMessage,
  ])

  assert.equal(replayableMessages.length, 1)
  assert.equal(replayableMessages[0]?.role, 'user')
  assert.equal(replayableMessages[0]?.userMessageKind, 'tool_result')
  assert.match(replayableMessages[0]?.content ?? '', /first-range-line-150/u)
  assert.match(replayableMessages[0]?.content ?? '', /second-range-line-150/u)
  assert.equal((replayableMessages[0]?.content ?? '').includes('[tool replay context clipped to reduce context growth]'), false)
})

test('buildCodexInputMessages preserves standalone replayed tool context turns', () => {
  const listResult = buildSuccessfulToolArtifacts(
    sampleListToolCall,
    {
      entries: [{ kind: 'file', name: 'package.json' }],
      entryCount: 1,
      path: '.',
      targetKind: 'directory',
      totalVisibleEntryCount: 1,
    },
    sampleListToolCall.startedAt,
    sampleListToolCall.startedAt,
  )
  const replayableMessages = buildReplayableMessageHistory([
    {
      content: 'Inspecting now.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 1_700_000_000_000,
    },
    {
      content: listResult.resultContent,
      id: 'tool-1',
      role: 'tool',
      timestamp: 1_700_000_000_001,
      toolCallId: 'call-1',
    },
    {
      content: 'Please continue from that.',
      id: 'user-1',
      role: 'user',
      timestamp: 1_700_000_000_002,
    },
  ] satisfies Message[])

  assert.deepEqual(buildCodexInputMessages(replayableMessages), [
    {
      content: [{ text: 'Inspecting now.', type: 'output_text' }],
      role: 'assistant',
    },
    {
      content: [{ text: replayableMessages[1]?.content ?? '', type: 'input_text' }],
      role: 'user',
    },
    {
      content: [{ text: TOOL_RESULT_TO_USER_BRIDGE_TEXT, type: 'output_text' }],
      role: 'assistant',
    },
    {
      content: [{ text: 'Please continue from that.', type: 'input_text' }],
      role: 'user',
    },
  ])
})

test('buildReplayableMessageHistory normalizes existing synthetic tool-result messages as standalone turns', () => {
  const replayableMessages = buildReplayableMessageHistory([
    {
      content: 'Authoritative tool results from the immediately preceding tool calls.',
      id: 'tool-context-1',
      role: 'user',
      timestamp: 100,
      userMessageKind: 'tool_result',
    },
    {
      content: 'Continue.',
      id: 'user-1',
      role: 'user',
      timestamp: 101,
      userMessageKind: 'human',
    },
  ] satisfies Message[])

  assert.equal(replayableMessages.length, 3)
  assert.equal(replayableMessages[0]?.role, 'user')
  assert.equal(replayableMessages[0]?.userMessageKind, 'tool_result')
  assert.ok((replayableMessages[0]?.content ?? '').startsWith(TOOL_OUTPUT_PREFIX))
  assert.ok((replayableMessages[0]?.content ?? '').includes(TOOL_RESULTS_TAG_OPEN))
  assert.match(replayableMessages[0]?.content ?? '', /Authoritative tool results from the immediately preceding tool calls\./u)
  assert.ok((replayableMessages[0]?.content ?? '').includes(TOOL_RESULTS_TAG_CLOSE))
  assert.equal(replayableMessages[1]?.role, 'assistant')
  assert.equal(replayableMessages[1]?.content, TOOL_RESULT_TO_USER_BRIDGE_TEXT)
  assert.equal(replayableMessages[2]?.role, 'user')
  assert.equal(replayableMessages[2]?.userMessageKind, 'human')
  assert.equal(replayableMessages[2]?.content, 'Continue.')
})

test('buildReplayableMessageHistory keeps runtime context update messages as separate turns', () => {
  const replayableMessages = buildReplayableMessageHistory([
    {
      content: [
        'Runtime context update. Treat this as authoritative for the current turn.',
        '<context_update>',
        JSON.stringify(
          {
            agentContextRootPath: 'C:/workspace',
            providerId: 'codex',
            schema: 'echosphere.runtime_context/v1',
            terminalExecutionMode: 'full',
          },
          null,
          2,
        ),
        '</context_update>',
      ].join('\n'),
      id: 'runtime-context-1',
      role: 'user',
      timestamp: 200,
      userMessageKind: 'tool_result',
    },
    {
      content: 'Proceed.',
      id: 'user-1',
      role: 'user',
      timestamp: 201,
      userMessageKind: 'human',
    },
  ] satisfies Message[])

  assert.equal(replayableMessages.length, 2)
  assert.equal(replayableMessages[0]?.userMessageKind, 'tool_result')
  assert.equal(replayableMessages[1]?.content, 'Proceed.')
})

test('buildReplayableMessageHistory also converts tool messages appended after an already replayed history', () => {
  const patchToolCall: OpenAICompatibleToolCall = {
    argumentsText:
      '{"edits":[{"absolute_path":"C:/workspace/src/components/Hero.tsx","old_string":"","new_string":"export default function Hero() {}\\n"}]}',
    id: 'call-edit-1',
    name: 'edit',
    startedAt: 1_700_000_000_100,
  }
  const patchResult = buildSuccessfulToolArtifacts(
    patchToolCall,
    {
      addedPaths: ['src/components/Hero.tsx'],
      changeCount: 1,
      contentChanged: true,
      deletedPaths: [],
      endLineNumber: 1,
      message: 'Created src/components/Hero.tsx successfully.',
      modifiedPaths: [],
      newContent: 'export default function Hero() {}\n',
      oldContent: null,
      operation: 'edit',
      path: 'src/components/Hero.tsx',
      startLineNumber: 1,
      targetKind: 'file',
    },
    patchToolCall.startedAt,
    patchToolCall.startedAt + 10,
  )

  const alreadyReplayableMessages = buildReplayableMessageHistory([
    {
      content: 'Create the hero component.',
      id: 'user-1',
      role: 'user',
      timestamp: 1_700_000_000_000,
    },
  ])

  alreadyReplayableMessages.push(patchResult.syntheticMessage)

  const replayableAfterNewToolResult = buildReplayableMessageHistory(alreadyReplayableMessages)

  assert.equal(replayableAfterNewToolResult.some((message) => message.role === 'tool'), false)
  const toolContextMessage = replayableAfterNewToolResult.at(-1)
  assert.equal(toolContextMessage?.role, 'user')
  assert.equal(toolContextMessage?.userMessageKind, 'tool_result')
  assert.match(toolContextMessage?.content ?? '', /^\[SYSTEM TOOL OUTPUT\]/u)
  assert.match(toolContextMessage?.content ?? '', /<tool_results>/u)
  assert.match(toolContextMessage?.content ?? '', /Authoritative tool results from the immediately preceding tool calls\./u)
  assert.match(toolContextMessage?.content ?? '', /Reuse the latest inspection state below before repeating the same inspection tool call\./u)
  assert.match(
    toolContextMessage?.content ?? '',
    /For each mutated path, the latest successful mutation below is the current workspace state\./u,
  )
  assert.match(toolContextMessage?.content ?? '', /Acknowledged tool result summaries:/u)
  assert.match(
    toolContextMessage?.content ?? '',
    /- edit success: Applied edits to src\/components\/Hero\.tsx\. The current workspace state for this path is included below and should be treated as authoritative\./u,
  )
  assert.match(toolContextMessage?.content ?? '', /Latest acknowledged workspace file state:/u)
  assert.match(
    toolContextMessage?.content ?? '',
    /- src\/components\/Hero\.tsx now reflects the latest successful edit changes\./u,
  )
  assert.match(toolContextMessage?.content ?? '', /"toolName": "edit"/u)
  assert.match(
    toolContextMessage?.content ?? '',
    /Current workspace state for src\/components\/Hero\.tsx is authoritative\./u,
  )
  assert.match(toolContextMessage?.content ?? '', /Created src\/components\/Hero\.tsx successfully\./u)
})
