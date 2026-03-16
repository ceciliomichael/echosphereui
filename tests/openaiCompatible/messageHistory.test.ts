import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplayableMessageHistory } from '../../electron/chat/openaiCompatible/messageHistory'
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

test('buildReplayableMessageHistory converts persisted tool messages into synthetic user context', () => {
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

  assert.equal(replayableMessages.length, 3)
  assert.equal(replayableMessages[0]?.role, 'assistant')
  assert.equal(replayableMessages[1]?.role, 'user')
  assert.equal(replayableMessages[1]?.userMessageKind, 'tool_result')
  assert.match(replayableMessages[1]?.content ?? '', /Authoritative tool results from the immediately preceding tool calls\./u)
  assert.match(replayableMessages[1]?.content ?? '', /Reuse the latest inspection state below before repeating the same inspection tool call\./u)
  assert.match(
    replayableMessages[1]?.content ?? '',
    /For each mutated path, the latest successful mutation below is the current workspace state\./u,
  )
  assert.match(replayableMessages[1]?.content ?? '', /Acknowledged tool result summaries:/u)
  assert.match(replayableMessages[1]?.content ?? '', /Latest acknowledged inspection state\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- \. was last listed with 2 visible entries\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- package\.json was last read at lines 1-3\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- list success: Listed \. with 2 visible entries\./u)
  assert.match(replayableMessages[1]?.content ?? '', /- read success: Read package\.json lines 1-3\./u)
  assert.match(replayableMessages[1]?.content ?? '', /"toolName": "list"/u)
  assert.match(replayableMessages[1]?.content ?? '', /"toolName": "read"/u)
  assert.equal(replayableMessages[1]?.timestamp, 1_700_000_000_020)
  assert.equal(replayableMessages[2]?.content, 'What did you find?')
  assert.equal(replayableMessages.some((message) => message.role === 'tool'), false)
})

test('buildCodexInputMessages keeps replayed tool context ahead of the next user turn', () => {
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
      content: [{ text: 'Please continue from that.', type: 'input_text' }],
      role: 'user',
    },
  ])
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
    /Acknowledged workspace state: src\/components\/Hero\.tsx was edited successfully and now reflects the applied changes\./u,
  )
  assert.match(toolContextMessage?.content ?? '', /Created src\/components\/Hero\.tsx successfully\./u)
})
