import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Message } from '../../src/types/chat'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'
import {
  createHydratedToolExecutionTurnState,
  createToolExecutionScheduler,
  createToolExecutionTurnState,
  executeToolCallWithPolicies,
} from '../../electron/chat/openaiCompatible/toolExecution'
import { buildSuccessfulToolArtifacts } from '../../electron/chat/openaiCompatible/toolResultFormatter'
import type {
  OpenAICompatibleToolCall,
  OpenAICompatibleToolExecutionMode,
} from '../../electron/chat/openaiCompatible/toolTypes'

function createListToolCall(id: string, workspacePath: string): OpenAICompatibleToolCall {
  return {
    argumentsText: JSON.stringify({ absolute_path: workspacePath }),
    id,
    name: 'list',
    startedAt: 1_700_000_000_000,
  }
}

function createReadToolCall(
  id: string,
  filePath: string,
  options?: { endLine?: number; startLine?: number },
): OpenAICompatibleToolCall {
  return {
    argumentsText: JSON.stringify({
      absolute_path: filePath,
      ...(options?.endLine === undefined ? {} : { end_line: options.endLine }),
      ...(options?.startLine === undefined ? {} : { start_line: options.startLine }),
    }),
    id,
    name: 'read',
    startedAt: 1_700_000_000_000,
  }
}

function createPatchToolCall(id: string, filePath: string, oldContent: string, newContent: string): OpenAICompatibleToolCall {
  const patchPath = filePath.replace(/\\/g, '/')
  const patch = `*** Begin Patch\n*** Update File: ${patchPath}\n@@\n-${oldContent}\n+${newContent}\n*** End Patch`
  return {
    argumentsText: JSON.stringify({ patch }),
    id,
    name: 'patch',
    startedAt: 1_700_000_000_000,
  }
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-tool-policy-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('executeToolCallWithPolicies allows repeating the same list call without an intervening mutation', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.writeFile(path.join(workspacePath, 'package.json'), '{}', 'utf8')

    const emittedEvents: StreamDeltaEvent[] = []
    const inMemoryMessages: Message[] = []
    const turnState = createToolExecutionTurnState()
    const context = {
      emitDelta(event: StreamDeltaEvent) {
        emittedEvents.push(event)
      },
      signal: new AbortController().signal,
      workspaceCheckpointId: null,
    }

    await executeToolCallWithPolicies(createListToolCall('call-1', workspacePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(createListToolCall('call-2', workspacePath), context, workspacePath, inMemoryMessages, turnState)

    assert.equal(inMemoryMessages.length, 2)
    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')

    assert.equal(completedEvents.length, 2)
    assert.equal(failedEvents.length, 0)
  })
})

test('executeToolCallWithPolicies allows rereading the same file without an intervening mutation', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'notes.txt')
    await fs.writeFile(filePath, 'hello', 'utf8')

    const emittedEvents: StreamDeltaEvent[] = []
    const inMemoryMessages: Message[] = []
    const turnState = createToolExecutionTurnState()
    const context = {
      emitDelta(event: StreamDeltaEvent) {
        emittedEvents.push(event)
      },
      signal: new AbortController().signal,
      workspaceCheckpointId: null,
    }

    await executeToolCallWithPolicies(createReadToolCall('read-1', filePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(createReadToolCall('read-2', filePath), context, workspacePath, inMemoryMessages, turnState)

    assert.equal(inMemoryMessages.length, 2)
    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')
    assert.equal(completedEvents.length, 2)
    assert.equal(failedEvents.length, 0)
  })
})

test('createHydratedToolExecutionTurnState allows rereads from historical read tool results', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'notes.txt')
    await fs.writeFile(filePath, 'hello', 'utf8')

    const historicalReadCall = createReadToolCall('read-history-1', filePath)
    const historicalReadResult = buildSuccessfulToolArtifacts(
      historicalReadCall,
      {
        content: 'hello',
        endLine: 1,
        lineCount: 1,
        maxReadLineCount: 500,
        path: 'notes.txt',
        startLine: 1,
        totalLineCount: 1,
        targetKind: 'file',
        truncated: false,
      },
      historicalReadCall.startedAt,
      historicalReadCall.startedAt + 1,
    )
    const historicalMessages: Message[] = [historicalReadResult.syntheticMessage]

    const emittedEvents: StreamDeltaEvent[] = []
    const inMemoryMessages: Message[] = []
    const turnState = createHydratedToolExecutionTurnState(historicalMessages, workspacePath)
    const context = {
      emitDelta(event: StreamDeltaEvent) {
        emittedEvents.push(event)
      },
      signal: new AbortController().signal,
      workspaceCheckpointId: null,
    }

    await executeToolCallWithPolicies(createReadToolCall('read-next-1', filePath), context, workspacePath, inMemoryMessages, turnState)

    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')
    assert.equal(completedEvents.length, 1)
    assert.equal(failedEvents.length, 0)
  })
})

test('executeToolCallWithPolicies allows post-patch rereads of the same already-known file range', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'notes.txt')
    await fs.writeFile(filePath, 'hello\nworld\nagain', 'utf8')

    const emittedEvents: StreamDeltaEvent[] = []
    const inMemoryMessages: Message[] = []
    const turnState = createToolExecutionTurnState()
    const context = {
      emitDelta(event: StreamDeltaEvent) {
        emittedEvents.push(event)
      },
      signal: new AbortController().signal,
      workspaceCheckpointId: null,
    }

    await executeToolCallWithPolicies(createReadToolCall('read-1', filePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(
      createPatchToolCall('patch-1', filePath, 'hello', 'updated'),
      context,
      workspacePath,
      inMemoryMessages,
      turnState,
    )
    await executeToolCallWithPolicies(createReadToolCall('read-2', filePath), context, workspacePath, inMemoryMessages, turnState)

    assert.equal(inMemoryMessages.length, 3)
    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')
    assert.equal(completedEvents.length, 3)
    assert.equal(failedEvents.length, 0)
  })
})

test('executeToolCallWithPolicies allows post-patch reads when they request genuinely new file content', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'notes.txt')
    await fs.writeFile(filePath, 'hello\nworld\nagain', 'utf8')

    const emittedEvents: StreamDeltaEvent[] = []
    const inMemoryMessages: Message[] = []
    const turnState = createToolExecutionTurnState()
    const context = {
      emitDelta(event: StreamDeltaEvent) {
        emittedEvents.push(event)
      },
      signal: new AbortController().signal,
      workspaceCheckpointId: null,
    }

    await executeToolCallWithPolicies(
      createReadToolCall('read-1', filePath, { endLine: 1, startLine: 1 }),
      context,
      workspacePath,
      inMemoryMessages,
      turnState,
    )
    await executeToolCallWithPolicies(
      createPatchToolCall('patch-1', filePath, 'hello', 'updated'),
      context,
      workspacePath,
      inMemoryMessages,
      turnState,
    )
    await executeToolCallWithPolicies(
      createReadToolCall('read-2', filePath, { endLine: 3, startLine: 2 }),
      context,
      workspacePath,
      inMemoryMessages,
      turnState,
    )

    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')
    assert.equal(completedEvents.length, 3)
    assert.equal(failedEvents.length, 0)
  })
})

test('createToolExecutionScheduler runs parallel tool calls without serial buffering', async () => {
  const emittedEvents: StreamDeltaEvent[] = []
  const inMemoryMessages: Message[] = []
  const turnState = createToolExecutionTurnState()
  const startedToolCalls: string[] = []
  const completedToolCalls: string[] = []
  const context = {
    emitDelta(event: StreamDeltaEvent) {
      emittedEvents.push(event)
    },
    signal: new AbortController().signal,
    workspaceCheckpointId: null,
  }
  const scheduler = createToolExecutionScheduler(
    {
      agentContextRootPath: 'C:\\workspace',
      context,
      inMemoryMessages,
      turnState,
    },
    {
      async executeToolCall(toolCall) {
        startedToolCalls.push(toolCall.id)
        await new Promise((resolve) => setTimeout(resolve, toolCall.id === 'read-1' ? 60 : 10))
        completedToolCalls.push(toolCall.id)
      },
      resolveExecutionMode() {
        return 'parallel'
      },
    },
  )

  const startTime = Date.now()
  scheduler.schedule(createReadToolCall('read-1', 'C:\\workspace\\one.txt'))
  scheduler.schedule(createReadToolCall('read-2', 'C:\\workspace\\two.txt'))
  await scheduler.drain()
  const elapsedMs = Date.now() - startTime

  assert.deepEqual(startedToolCalls, ['read-1', 'read-2'])
  assert.deepEqual(completedToolCalls, ['read-2', 'read-1'])
  assert.equal(elapsedMs < 120, true)
  assert.equal(emittedEvents.length, 0)
})

test('createToolExecutionScheduler allows path-exclusive tool calls on different files to finish independently', async () => {
  const executionLog: string[] = []
  const completedToolCalls: string[] = []
  const context = {
    emitDelta() {},
    signal: new AbortController().signal,
    workspaceCheckpointId: null,
  }
  const scheduler = createToolExecutionScheduler(
    {
      agentContextRootPath: 'C:\\workspace',
      context,
      inMemoryMessages: [],
      turnState: createToolExecutionTurnState(),
    },
    {
      async executeToolCall(toolCall) {
        executionLog.push(`start:${toolCall.id}`)
        await new Promise((resolve) => setTimeout(resolve, toolCall.id === 'write-hero' ? 50 : 10))
        executionLog.push(`end:${toolCall.id}`)
        completedToolCalls.push(toolCall.id)
      },
      resolveExecutionMode(toolName: string): OpenAICompatibleToolExecutionMode {
        return toolName === 'write' ? 'path-exclusive' : 'parallel'
      },
      resolveExecutionResourceKey(toolCall) {
        if (toolCall.id === 'write-hero') {
          return 'src/components/Hero.tsx'
        }

        if (toolCall.id === 'write-footer') {
          return 'src/components/Footer.tsx'
        }

        return null
      },
    },
  )

  scheduler.schedule({
    argumentsText: JSON.stringify({ absolute_path: 'C:\\workspace\\src\\components\\Hero.tsx', content: 'hero' }),
    id: 'write-hero',
    name: 'write',
    startedAt: 1_700_000_000_000,
  })
  scheduler.schedule({
    argumentsText: JSON.stringify({ absolute_path: 'C:\\workspace\\src\\components\\Footer.tsx', content: 'footer' }),
    id: 'write-footer',
    name: 'write',
    startedAt: 1_700_000_000_000,
  })
  await scheduler.drain()

  assert.deepEqual(executionLog.slice(0, 2), ['start:write-hero', 'start:write-footer'])
  assert.deepEqual(completedToolCalls, ['write-footer', 'write-hero'])
})

test('createToolExecutionScheduler still serializes path-exclusive tool calls for the same file', async () => {
  const executionLog: string[] = []
  const context = {
    emitDelta() {},
    signal: new AbortController().signal,
    workspaceCheckpointId: null,
  }
  const scheduler = createToolExecutionScheduler(
    {
      agentContextRootPath: 'C:\\workspace',
      context,
      inMemoryMessages: [],
      turnState: createToolExecutionTurnState(),
    },
    {
      async executeToolCall(toolCall) {
        executionLog.push(`start:${toolCall.id}`)
        await new Promise((resolve) => setTimeout(resolve, 10))
        executionLog.push(`end:${toolCall.id}`)
      },
      resolveExecutionMode(toolName: string): OpenAICompatibleToolExecutionMode {
        return toolName === 'write' ? 'path-exclusive' : 'parallel'
      },
      resolveExecutionResourceKey() {
        return 'src/components/Hero.tsx'
      },
    },
  )

  scheduler.schedule({
    argumentsText: JSON.stringify({ absolute_path: 'C:\\workspace\\src\\components\\Hero.tsx', content: 'hero 1' }),
    id: 'write-hero-1',
    name: 'write',
    startedAt: 1_700_000_000_000,
  })
  scheduler.schedule({
    argumentsText: JSON.stringify({ absolute_path: 'C:\\workspace\\src\\components\\Hero.tsx', content: 'hero 2' }),
    id: 'write-hero-2',
    name: 'write',
    startedAt: 1_700_000_000_000,
  })
  await scheduler.drain()

  assert.deepEqual(executionLog, [
    'start:write-hero-1',
    'end:write-hero-1',
    'start:write-hero-2',
    'end:write-hero-2',
  ])
})
