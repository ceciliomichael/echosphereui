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
    toolName: 'read',
  })

  const streamedMessages = harness.manager.finalizeStreamedMessages(false)
  assert.ok(streamedMessages)
  assert.equal(streamedMessages?.[0]?.toolInvocations?.[0]?.state, 'failed')
  assert.equal(streamedMessages?.[0]?.toolInvocations?.[0]?.resultContent, 'Tool execution ended before completion.')
  assert.equal(harness.getLatestConversationMessages().length > 0, true)
})

