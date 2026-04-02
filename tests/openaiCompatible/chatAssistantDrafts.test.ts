import assert from 'node:assert/strict'
import test from 'node:test'
import { createChatAssistantDraftManager } from '../../src/hooks/chatAssistantDrafts'
import type { Message } from '../../src/types/chat'

function createDraftManagerHarness() {
  const localMessages = new Map<string, Message>()
  let latestConversationMessages: Message[] = []

  const manager = createChatAssistantDraftManager({
    appendLocalMessage(_conversationId, message) {
      localMessages.set(message.id, message)
    },
    conversationId: 'conversation-1',
    initialConversationMessages: [],
    markTextStreamingPulse() {},
    onConversationMessagesUpdated(messages) {
      latestConversationMessages = messages
    },
    providerId: 'openai-compatible',
    removeLocalMessage(_conversationId, messageId) {
      localMessages.delete(messageId)
    },
    runtimeSelection: {
      hasConfiguredProvider: true,
      modelId: 'test-model',
      providerId: 'openai-compatible',
      providerLabel: 'OpenAI Compatible',
      reasoningEffort: 'medium',
      terminalExecutionMode: 'full',
    },
    stopTextStreaming() {},
    updateConversationRuntimeState() {},
    updateLocalMessage(_conversationId, messageId, updater) {
      const currentMessage = localMessages.get(messageId)
      if (!currentMessage) {
        throw new Error(`Missing local message: ${messageId}`)
      }

      localMessages.set(messageId, updater(currentMessage))
    },
  })

  return {
    getLatestConversationMessages() {
      return latestConversationMessages
    },
    manager,
  }
}

test('finalizeStreamedMessages marks unfinished tool invocations as failed on abort', () => {
  const harness = createDraftManagerHarness()

  harness.manager.handleToolInvocationStarted('call-1', {
    argumentsText: '{"absolute_path":"C:\\\\repo"}',
    startedAt: 100,
    toolName: 'list',
  })

  const streamedMessages = harness.manager.finalizeStreamedMessages(true)
  assert.ok(streamedMessages)
  assert.equal(streamedMessages?.length, 1)

  const assistantMessage = streamedMessages?.[0]
  assert.ok(assistantMessage)
  assert.equal(assistantMessage?.role, 'assistant')
  assert.equal(assistantMessage?.toolInvocations?.length, 1)
  assert.equal(assistantMessage?.toolInvocations?.[0]?.state, 'failed')
  assert.equal(assistantMessage?.toolInvocations?.[0]?.resultContent, 'Tool execution aborted before completion.')
  assert.equal(typeof assistantMessage?.toolInvocations?.[0]?.completedAt, 'number')
})

test('finalizeStreamedMessages marks unfinished tool invocations as failed when a turn ends unexpectedly', () => {
  const harness = createDraftManagerHarness()

  harness.manager.handleToolInvocationStarted('call-1', {
    argumentsText: '{}',
    startedAt: 100,
    toolName: 'list',
  })

  const streamedMessages = harness.manager.finalizeStreamedMessages(false)
  assert.ok(streamedMessages)
  assert.equal(streamedMessages?.[0]?.toolInvocations?.[0]?.state, 'failed')
  assert.equal(streamedMessages?.[0]?.toolInvocations?.[0]?.resultContent, 'Tool execution ended before completion.')
  assert.equal(harness.getLatestConversationMessages().length > 0, true)
})

test('draft manager keeps streamed assistant segments ordered as separate messages', () => {
  const harness = createDraftManagerHarness()

  harness.manager.appendPlaceholderDraft()
  harness.manager.handleContentDelta('I will create the Team section')
  harness.manager.handleToolInvocationStarted('call-1', {
    argumentsText: '{"absolute_path":"C:\\\\repo\\\\Team.tsx"}',
    startedAt: 200,
    toolName: 'glob',
  })
  harness.manager.handleContentDelta(' before moving on.')

  const assistantMessages = harness
    .getLatestConversationMessages()
    .filter((message): message is Message => message.role === 'assistant')

  assert.equal(assistantMessages.length, 3)
  assert.equal(assistantMessages[0]?.content, 'I will create the Team section')
  assert.equal(assistantMessages[0]?.toolInvocations?.length ?? 0, 0)
  assert.equal(assistantMessages[1]?.content, '')
  assert.equal(assistantMessages[1]?.toolInvocations?.length, 1)
  assert.equal(assistantMessages[1]?.toolInvocations?.[0]?.toolName, 'glob')
  assert.equal(assistantMessages[1]?.toolInvocations?.[0]?.state, 'running')
  assert.equal(assistantMessages[2]?.content, ' before moving on.')
  assert.equal(assistantMessages[2]?.toolInvocations?.length ?? 0, 0)
})

test('handleReasoningDelta completes reasoning as soon as </think> is received', () => {
  const harness = createDraftManagerHarness()

  harness.manager.appendPlaceholderDraft()
  harness.manager.handleReasoningDelta('<think>Plan')

  const activeReasoningMessage = harness
    .getLatestConversationMessages()
    .find((message): message is Message => message.role === 'assistant')
  assert.equal(activeReasoningMessage?.reasoningCompletedAt, undefined)

  harness.manager.handleReasoningDelta(' carefully</think>')

  const completedReasoningMessage = harness
    .getLatestConversationMessages()
    .find((message): message is Message => message.role === 'assistant')

  assert.equal(typeof completedReasoningMessage?.reasoningCompletedAt, 'number')
  assert.equal(completedReasoningMessage?.reasoningContent, '<think>Plan carefully</think>')
})

test('handleContentDelta completes reasoning when a think block closes in content stream', () => {
  const harness = createDraftManagerHarness()

  harness.manager.appendPlaceholderDraft()
  harness.manager.handleContentDelta('<think>Plan carefully</think>')

  const completedMessage = harness
    .getLatestConversationMessages()
    .find((message): message is Message => message.role === 'assistant')

  assert.equal(typeof completedMessage?.reasoningCompletedAt, 'number')
  assert.equal(completedMessage?.content, '<think>Plan carefully</think>')
})

test('handleReasoningDelta creates a new assistant draft after visible content already streamed', () => {
  const harness = createDraftManagerHarness()

  harness.manager.appendPlaceholderDraft()
  harness.manager.handleContentDelta('Primary answer content.')
  harness.manager.handleReasoningDelta('Late reasoning after answer.')

  const assistantMessages = harness
    .getLatestConversationMessages()
    .filter((message): message is Message => message.role === 'assistant')

  assert.equal(assistantMessages.length, 2)
  assert.equal(assistantMessages[0]?.content, 'Primary answer content.')
  assert.equal(assistantMessages[0]?.reasoningContent, '')
  assert.equal(assistantMessages[1]?.content, '')
  assert.equal(assistantMessages[1]?.reasoningContent, 'Late reasoning after answer.')
})

test('streaming deltas deduplicate duplicate chunks for reasoning and content', () => {
  const harness = createDraftManagerHarness()

  harness.manager.appendPlaceholderDraft()
  harness.manager.handleReasoningDelta('I will inspect the file.')
  harness.manager.handleReasoningDelta('I will inspect the file.')
  harness.manager.handleContentDelta('Result summary.')
  harness.manager.handleContentDelta('Result summary.')

  const assistantMessage = harness
    .getLatestConversationMessages()
    .find((message): message is Message => message.role === 'assistant')

  assert.equal(assistantMessage?.reasoningContent, 'I will inspect the file.')
  assert.equal(assistantMessage?.content, 'Result summary.')
})
