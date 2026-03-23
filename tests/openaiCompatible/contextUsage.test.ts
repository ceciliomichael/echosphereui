import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { estimateChatContextUsage } from '../../electron/chat/contextUsage'
import {
  getKnownOpenAICompatibleTransportMode,
  resetKnownOpenAICompatibleTransportMode,
  setKnownOpenAICompatibleTransportMode,
} from '../../electron/chat/providers/openaiCompatibleTransportState'
import { PROVIDER_SYSTEM_INSTRUCTIONS } from '../../electron/chat/providers/providerSystemInstructions'
import type { Message } from '../../src/types/chat'

const temporaryDirectories: string[] = []
const initialOpenAICompatibleTransportMode = getKnownOpenAICompatibleTransportMode()

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directoryPath) => rm(directoryPath, { force: true, recursive: true })),
  )
  if (initialOpenAICompatibleTransportMode === null) {
    resetKnownOpenAICompatibleTransportMode()
  } else {
    setKnownOpenAICompatibleTransportMode(initialOpenAICompatibleTransportMode)
  }
})

test('estimateChatContextUsage uses provider system instructions and excludes tool messages for openai', async () => {
  const messages: Message[] = [
    {
      content: 'abcd',
      id: 'user-1',
      role: 'user',
      timestamp: 1,
    },
    {
      content: 'abcdefgh',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 2,
    },
    {
      content: 'tool output should not count here',
      id: 'tool-1',
      role: 'tool',
      timestamp: 3,
      toolCallId: 'call-1',
    },
  ]

  const usage = await estimateChatContextUsage({
    agentContextRootPath: null,
    chatMode: 'agent',
    messages,
    providerId: 'openai',
  })

  assert.equal(usage.systemPromptTokens, Math.ceil(PROVIDER_SYSTEM_INSTRUCTIONS.length / 4))
  assert.equal(usage.historyTokens, Math.ceil('abcd\n\nabcdefgh'.length / 4))
  assert.equal(usage.toolResultsTokens, 0)
  assert.equal(usage.totalTokens, usage.systemPromptTokens + usage.historyTokens)
  assert.equal(usage.maxTokens, 200_000)
})

test('estimateChatContextUsage counts tool-role context for codex', async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'echosphere-context-usage-'))
  temporaryDirectories.push(rootPath)
  await writeFile(path.join(rootPath, 'AGENTS.md'), 'Project instructions for tests.', 'utf8')

  const messages: Message[] = [
    {
      content: 'Need a file list',
      id: 'user-1',
      role: 'user',
      timestamp: 1,
    },
    {
      content: 'Checking the workspace.',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 2,
    },
    {
      content: [
        'Acknowledged directory inspection result: Listed the src directory. The structured block below is authoritative.',
        '<tool_result>',
        JSON.stringify(
          {
            arguments: {
              absolute_path: rootPath,
            },
            schema: 'echosphere.tool_result/v1',
            status: 'success',
            summary: 'Listed the src directory.',
            toolCallId: 'call-1',
            toolName: 'list',
          },
          null,
          2,
        ),
        '</tool_result>',
        '<tool_result_body>',
        'Directory src\n[F] index.ts',
        '</tool_result_body>',
      ].join('\n'),
      id: 'tool-1',
      role: 'tool',
      timestamp: 3,
      toolCallId: 'call-1',
    },
  ]

  const usage = await estimateChatContextUsage({
    agentContextRootPath: rootPath,
    chatMode: 'agent',
    messages,
    providerId: 'codex',
  })

  assert.ok(usage.systemPromptTokens > 0)
  assert.ok(usage.historyTokens > 0)
  assert.ok(usage.toolResultsTokens > 0)
  assert.equal(usage.totalTokens, usage.systemPromptTokens + usage.historyTokens + usage.toolResultsTokens)
  assert.equal(usage.maxTokens, 200_000)
})

test('estimateChatContextUsage treats runtime context update messages as history context, not tool output', async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'echosphere-context-runtime-'))
  temporaryDirectories.push(rootPath)
  await writeFile(path.join(rootPath, 'AGENTS.md'), 'Runtime context test instructions.', 'utf8')

  const runtimeContextMessage: Message = {
    content: [
      'Runtime context update. Treat this as authoritative for the current turn.',
      '<context_update>',
      JSON.stringify(
        {
          agentContextRootPath: rootPath,
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
    timestamp: 1,
    userMessageKind: 'tool_result',
  }

  const usage = await estimateChatContextUsage({
    agentContextRootPath: rootPath,
    chatMode: 'agent',
    messages: [runtimeContextMessage],
    providerId: 'codex',
  })

  assert.ok(usage.systemPromptTokens > 0)
  assert.ok(usage.historyTokens > 0)
  assert.equal(usage.toolResultsTokens, 0)
})

test('estimateChatContextUsage does not count raw tool messages as separate tool-result context for openai-compatible Responses transport', async () => {
  setKnownOpenAICompatibleTransportMode('responses')

  const messages: Message[] = [
    {
      content: 'Inspect the workspace.',
      id: 'user-1',
      role: 'user',
      timestamp: 1,
    },
    {
      content: '',
      id: 'assistant-1',
      role: 'assistant',
      timestamp: 2,
      toolInvocations: [
        {
          argumentsText: '{"absolute_path":"C:/workspace"}',
          completedAt: 3,
          id: 'call-1',
          resultContent: 'Listed C:/workspace.',
          startedAt: 2,
          state: 'completed',
          toolName: 'list',
        },
      ],
    },
    {
      content: 'Acknowledged tool result: Listed C:/workspace.',
      id: 'tool-1',
      role: 'tool',
      timestamp: 3,
      toolCallId: 'call-1',
    },
  ]

  const usage = await estimateChatContextUsage({
    agentContextRootPath: 'C:/workspace',
    chatMode: 'agent',
    messages,
    providerId: 'openai-compatible',
  })

  assert.ok(usage.systemPromptTokens > 0)
  assert.ok(usage.historyTokens > 0)
  assert.equal(usage.toolResultsTokens, 0)
  assert.equal(usage.totalTokens, usage.systemPromptTokens + usage.historyTokens)
})
