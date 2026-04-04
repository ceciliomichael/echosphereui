import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversationRecord, Message, UserMessageRunCheckpoint } from '../../src/types/chat'
import { revertConversationToMessage } from '../../src/hooks/chatHistoryWorkflows'

type WindowMock = {
  echosphereHistory: {
    getConversation: (conversationId: string) => Promise<ConversationRecord | null>
    getUserMessageCheckpointHistory: (conversationId: string, messageId: string) => Promise<UserMessageRunCheckpoint[]>
    replaceMessages: (input: { conversationId: string; messages: Message[] }) => Promise<ConversationRecord>
  }
  echosphereWorkspace: {
    restoreCheckpoint: (checkpointId: string) => Promise<void>
  }
}

test('revertConversationToMessage truncates later messages', async () => {
  const targetCheckpoint: UserMessageRunCheckpoint = {
    createdAt: 100,
    id: 'checkpoint-1',
  }
  const conversation: ConversationRecord = {
    agentContextRootPath: '/workspace',
    chatMode: 'agent',
    createdAt: 1,
    folderId: null,
    id: 'conversation-1',
    messages: [
      {
        content: 'message 1',
        id: 'message-1',
        reasoningEffort: 'minimal',
        role: 'user',
        timestamp: 10,
        runCheckpoint: targetCheckpoint,
      },
      {
        content: 'assistant 2',
        id: 'message-2',
        role: 'assistant',
        timestamp: 20,
      },
      {
        content: 'message 3',
        id: 'message-3',
        reasoningEffort: 'minimal',
        role: 'user',
        timestamp: 30,
        runCheckpoint: {
          createdAt: 200,
          id: 'checkpoint-3',
        },
      },
      {
        content: 'assistant 4',
        id: 'message-4',
        role: 'assistant',
        timestamp: 40,
      },
    ],
    title: 'Thread',
    updatedAt: 40,
  }

  const replaceMessagesCalls: Array<{ conversationId: string; messages: Message[] }> = []
  const restoreCheckpointCalls: string[] = []
  const globalWithWindow = globalThis as typeof globalThis & { window?: WindowMock }
  const previousWindow = globalWithWindow.window

  globalWithWindow.window = {
    echosphereHistory: {
      getConversation: async (conversationId) => {
        return conversationId === conversation.id ? conversation : null
      },
      getUserMessageCheckpointHistory: async () => [],
      replaceMessages: async (input) => {
        replaceMessagesCalls.push(input)
        return {
          ...conversation,
          messages: input.messages,
        }
      },
    },
    echosphereWorkspace: {
      restoreCheckpoint: async (checkpointId) => {
        restoreCheckpointCalls.push(checkpointId)
      },
    },
  }

  try {
    const nextConversation = await revertConversationToMessage(conversation.id, 'message-1')

    assert.equal(restoreCheckpointCalls.length, 1)
    assert.equal(restoreCheckpointCalls[0], targetCheckpoint.id)
    assert.equal(replaceMessagesCalls.length, 1)
    assert.deepEqual(replaceMessagesCalls[0].messages, [conversation.messages[0]])
    assert.equal(nextConversation.messages.length, 1)
    assert.equal(nextConversation.messages[0]?.id, 'message-1')
  } finally {
    if (previousWindow === undefined) {
      delete globalWithWindow.window
    } else {
      globalWithWindow.window = previousWindow
    }
  }
})
