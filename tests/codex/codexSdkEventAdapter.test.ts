import assert from 'node:assert/strict'
import test from 'node:test'
import type { ThreadEvent } from '@openai/codex-sdk'
import type { StreamDeltaEvent } from '../../electron/chat/providerTypes'
import { DEFAULT_CODEX_NATIVE_TOOL_POLICY } from '../../electron/chat/providers/codexNativeTools'
import { createCodexSdkEventAdapter } from '../../electron/chat/providers/codexSdkEventAdapter'

function consumeEvents(events: ThreadEvent[]) {
  const emitted: StreamDeltaEvent[] = []
  const adapter = createCodexSdkEventAdapter(
    (event) => {
      emitted.push(event)
    },
    DEFAULT_CODEX_NATIVE_TOOL_POLICY,
  )

  for (const event of events) {
    adapter.consumeEvent(event)
  }

  return emitted
}

test('codex sdk adapter emits tool lifecycle events for command executions', () => {
  const emitted = consumeEvents([
    {
      item: {
        aggregated_output: '',
        command: 'npm run test',
        id: 'cmd_1',
        status: 'in_progress',
        type: 'command_execution',
      },
      type: 'item.started',
    },
    {
      item: {
        aggregated_output: 'ok',
        command: 'npm run test',
        id: 'cmd_1',
        status: 'completed',
        type: 'command_execution',
      },
      type: 'item.completed',
    },
  ])

  const startedEvent = emitted.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  const completedEvent = emitted.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_completed' }> =>
      event.type === 'tool_invocation_completed',
  )

  assert.ok(startedEvent)
  assert.ok(completedEvent)
  assert.equal(startedEvent.invocationId, 'cmd_1')
  assert.equal(startedEvent.toolName, 'exec_command')
  assert.equal(completedEvent.invocationId, 'cmd_1')
  assert.equal(completedEvent.toolName, 'exec_command')
  assert.equal(completedEvent.syntheticMessage.role, 'tool')
})

test('codex sdk adapter streams assistant and reasoning deltas from item updates', () => {
  const emitted = consumeEvents([
    {
      item: {
        id: 'assistant_1',
        text: 'Thinking',
        type: 'reasoning',
      },
      type: 'item.started',
    },
    {
      item: {
        id: 'assistant_1',
        text: 'Thinking done',
        type: 'reasoning',
      },
      type: 'item.updated',
    },
    {
      item: {
        id: 'assistant_2',
        text: 'Hello',
        type: 'agent_message',
      },
      type: 'item.started',
    },
    {
      item: {
        id: 'assistant_2',
        text: 'Hello world',
        type: 'agent_message',
      },
      type: 'item.updated',
    },
  ])

  const reasoningDeltas = emitted.filter(
    (event): event is Extract<StreamDeltaEvent, { type: 'reasoning_delta' }> => event.type === 'reasoning_delta',
  )
  const contentDeltas = emitted.filter(
    (event): event is Extract<StreamDeltaEvent, { type: 'content_delta' }> => event.type === 'content_delta',
  )

  assert.deepEqual(
    reasoningDeltas.map((event) => event.delta),
    ['Thinking', ' done'],
  )
  assert.deepEqual(
    contentDeltas.map((event) => event.delta),
    ['Hello', ' world'],
  )
})

test('codex sdk adapter maps native todo_list items to update_plan tool lifecycle events', () => {
  const emitted = consumeEvents([
    {
      item: {
        id: 'todo_1',
        items: [
          { completed: false, text: 'Inspect source files' },
          { completed: false, text: 'Apply UI changes' },
        ],
        type: 'todo_list',
      },
      type: 'item.started',
    },
    {
      item: {
        id: 'todo_1',
        items: [
          { completed: true, text: 'Inspect source files' },
          { completed: false, text: 'Apply UI changes' },
        ],
        type: 'todo_list',
      },
      type: 'item.updated',
    },
    {
      item: {
        id: 'todo_1',
        items: [
          { completed: true, text: 'Inspect source files' },
          { completed: true, text: 'Apply UI changes' },
        ],
        type: 'todo_list',
      },
      type: 'item.completed',
    },
  ])

  const startedEvent = emitted.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }> =>
      event.type === 'tool_invocation_started',
  )
  const deltaEvents = emitted.filter(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }> =>
      event.type === 'tool_invocation_delta',
  )
  const completedEvent = emitted.find(
    (event): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_completed' }> =>
      event.type === 'tool_invocation_completed',
  )

  assert.ok(startedEvent)
  assert.equal(startedEvent.toolName, 'update_plan')
  assert.ok(deltaEvents.length >= 1)
  assert.ok(completedEvent)
  assert.equal(completedEvent.toolName, 'update_plan')
  assert.match(completedEvent.resultContent, /"toolName": "update_plan"/u)
  assert.match(completedEvent.resultContent, /codex_native_plan/u)
})
