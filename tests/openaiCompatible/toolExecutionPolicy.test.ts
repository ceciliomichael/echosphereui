import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Message } from '../../src/types/chat'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'
import {
  createToolExecutionTurnState,
  executeToolCallWithPolicies,
} from '../../electron/chat/openaiCompatible/toolExecution'
import type { OpenAICompatibleToolCall } from '../../electron/chat/openaiCompatible/toolTypes'

function createListToolCall(id: string, workspacePath: string): OpenAICompatibleToolCall {
  return {
    argumentsText: JSON.stringify({ absolute_path: workspacePath }),
    id,
    name: 'list',
    startedAt: 1_700_000_000_000,
  }
}

function createReadToolCall(id: string, filePath: string): OpenAICompatibleToolCall {
  return {
    argumentsText: JSON.stringify({ absolute_path: filePath }),
    id,
    name: 'read',
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

test('executeToolCallWithPolicies allows repeating the same list call without a synthetic duplicate failure', async () => {
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
    }

    await executeToolCallWithPolicies(createListToolCall('call-1', workspacePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(createListToolCall('call-2', workspacePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(createListToolCall('call-3', workspacePath), context, workspacePath, inMemoryMessages, turnState)

    assert.equal(inMemoryMessages.length, 3)
    assert.equal(inMemoryMessages.every((message) => !message.content.includes('Repeated identical list call blocked')), true)

    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')

    assert.equal(completedEvents.length, 3)
    assert.equal(failedEvents.length, 0)
  })
})

test('executeToolCallWithPolicies allows rereading the same file without a synthetic duplicate failure', async () => {
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
    }

    await executeToolCallWithPolicies(createReadToolCall('read-1', filePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(createReadToolCall('read-2', filePath), context, workspacePath, inMemoryMessages, turnState)
    await executeToolCallWithPolicies(createReadToolCall('read-3', filePath), context, workspacePath, inMemoryMessages, turnState)

    assert.equal(inMemoryMessages.length, 3)
    assert.equal(inMemoryMessages.every((message) => !message.content.includes('Repeated identical read call blocked')), true)
    assert.equal(emittedEvents.every((event) => event.type !== 'tool_invocation_failed'), true)
  })
})
