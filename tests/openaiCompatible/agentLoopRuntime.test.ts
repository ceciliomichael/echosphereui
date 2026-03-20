import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { streamAgentLoopWithTools } from '../../electron/chat/agentLoop/runtime'
import type { ProviderStreamContext, StreamDeltaEvent } from '../../electron/chat/providerTypes'
import type { Message } from '../../src/types/chat'

function createProviderContext() {
  const abortController = new AbortController()
  const emittedEvents: StreamDeltaEvent[] = []

  const context: ProviderStreamContext = {
    emitDelta(event) {
      emittedEvents.push(event)
    },
    signal: abortController.signal,
    streamId: 'stream-test',
    terminalExecutionMode: 'full',
    workspaceCheckpointId: null,
  }

  return {
    abortController,
    context,
    emittedEvents,
  }
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-agent-loop-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('agent loop does not trigger missing-tool recovery when a tool was already scheduled via onToolCallReady', async () => {
  const { context } = createProviderContext()
  const turnMessages: Message[][] = []
  const forceToolChoices: Array<'none' | 'required' | undefined> = []
  let turnCount = 0

  await streamAgentLoopWithTools(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    context,
    async (request, _turnContext, options) => {
      turnCount += 1
      turnMessages.push(request.messages)
      forceToolChoices.push(request.forceToolChoice)

      if (turnCount === 1) {
        options?.onToolCallReady?.({
          argumentsText: '{}',
          id: 'tool-ready-1',
          name: 'nonexistent_tool',
          startedAt: Date.now(),
        })
      }

      if (turnCount === 2) {
        return {
          assistantContent: 'Done.',
          toolCalls: [],
        }
      }

      return {
        assistantContent: '',
        toolCalls: [],
      }
    },
  )

  assert.equal(turnCount, 2)
  const secondTurnMessages = turnMessages[1] ?? []
  const secondTurnUserTexts = secondTurnMessages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  assert.equal(
    secondTurnUserTexts.some((content) => content.includes('You have incomplete tasks. Continue your work on the current in_progress tasks.')),
    false,
  )
  assert.equal(forceToolChoices[1], undefined)
})

test('agent loop stops after a text-only turn with no tool calls', async () => {
  const { context } = createProviderContext()
  const turnMessages: Message[][] = []
  const forceToolChoices: Array<'none' | 'required' | undefined> = []
  let turnCount = 0

  await streamAgentLoopWithTools(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    context,
    async (request) => {
      turnCount += 1
      turnMessages.push(request.messages)
      forceToolChoices.push(request.forceToolChoice)

      if (turnCount === 1) {
        return {
          assistantContent: "I'll inspect the project files first.",
          toolCalls: [],
        }
      }

      return {
        assistantContent: 'Done.',
        toolCalls: [],
      }
    },
  )

  assert.equal(turnCount, 1)
  assert.deepEqual(forceToolChoices, [undefined])
  const firstTurnUserTexts = (turnMessages[0] ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  assert.equal(firstTurnUserTexts.some((content) => content.includes('Please address this message and continue with your tasks.')), false)
})

test('agent loop does not recover from regular explanatory prose in agent mode', async () => {
  const { context } = createProviderContext()
  const turnMessages: Message[][] = []
  let turnCount = 0

  await streamAgentLoopWithTools(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    context,
    async (request) => {
      turnCount += 1
      turnMessages.push(request.messages)

      return {
        assistantContent: 'Proceeding with the implementation.',
        toolCalls: [],
      }
    },
  )

  assert.equal(turnCount, 1)
  const firstTurnUserTexts = (turnMessages[0] ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  assert.equal(
    firstTurnUserTexts.some((content) => content.includes('Please address this message and continue with your tasks.')),
    false,
  )
})

test('agent loop does not recover when assistant turn is an explicit completion', async () => {
  const { context } = createProviderContext()
  let turnCount = 0

  await streamAgentLoopWithTools(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    context,
    async () => {
      turnCount += 1
      return {
        assistantContent: 'Done.',
        toolCalls: [],
      }
    },
  )

  assert.equal(turnCount, 1)
})

test('agent loop stops when a turn has neither assistant output nor tool invocation', async () => {
  const { context } = createProviderContext()
  const turnMessages: Message[][] = []
  let turnCount = 0

  await streamAgentLoopWithTools(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'agent',
      messages: [],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    context,
    async (request) => {
      turnCount += 1
      turnMessages.push(request.messages)

      if (turnCount === 1) {
        return {
          assistantContent: '',
          toolCalls: [],
        }
      }

      return {
        assistantContent: 'Done.',
        toolCalls: [],
      }
    },
  )

  assert.equal(turnCount, 1)
  const firstTurnUserTexts = (turnMessages[0] ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
  assert.equal(firstTurnUserTexts.some((content) => content.includes('Please address this message and continue with your tasks.')), false)
})

test('agent loop allows repeated identical tool calls until the model changes course', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.writeFile(path.join(workspacePath, 'package.json'), '{}', 'utf8')

    const { context, emittedEvents } = createProviderContext()
    let turnCount = 0

    await streamAgentLoopWithTools(
      {
        agentContextRootPath: workspacePath,
        chatMode: 'agent',
        messages: [],
        modelId: 'test-model',
        providerId: 'openai-compatible',
        reasoningEffort: 'medium',
        terminalExecutionMode: 'full',
      },
      context,
      async () => {
        turnCount += 1

        if (turnCount >= 4) {
          return {
            assistantContent: 'Done.',
            toolCalls: [],
          }
        }

        return {
          assistantContent: '',
          toolCalls: [
            {
              argumentsText: JSON.stringify({ absolute_path: workspacePath }),
              id: `list-${turnCount}`,
              name: 'list',
              startedAt: Date.now(),
            },
          ],
        }
      },
    )

    assert.equal(turnCount, 4)
    const completedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_completed')
    const failedEvents = emittedEvents.filter((event) => event.type === 'tool_invocation_failed')
    assert.equal(completedEvents.length, 3)
    assert.equal(failedEvents.length, 0)
  })
})

test('agent loop can halt immediately after plan-to-agent chat mode switch', async () => {
  const { context } = createProviderContext()
  const contextWithDecision: ProviderStreamContext = {
    ...context,
    awaitUserDecision: async () => ({
      selectedOptionId: 'yes_implement',
      selectedOptionLabel: 'Yes, implement the plan',
    }),
  }
  let turnCount = 0

  const loopResult = await streamAgentLoopWithTools(
    {
      agentContextRootPath: 'C:/workspace',
      chatMode: 'plan',
      haltOnPlanToAgentSwitch: true,
      messages: [],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    contextWithDecision,
    async () => {
      turnCount += 1

      return {
        assistantContent: '',
        toolCalls: [
          {
            argumentsText: '{}',
            id: 'ready-implement-1',
            name: 'ready_implement',
            startedAt: Date.now(),
          },
        ],
      }
    },
  )

  assert.equal(turnCount, 1)
  assert.equal(loopResult.transitionedPlanToAgent, true)
  assert.equal(loopResult.finalChatMode, 'agent')
})
