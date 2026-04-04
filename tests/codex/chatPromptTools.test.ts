import assert from 'node:assert/strict'
import test from 'node:test'
import { formatStructuredToolResultContent } from '../../src/lib/toolResultContent'
import type { Message } from '../../src/types/chat'
import { buildChatPrompt, buildChatSystemPrompt } from '../../electron/chat/shared/messages'

test('buildChatSystemPrompt loads the mode-specific prompt content', () => {
  const agentPrompt = buildChatSystemPrompt('agent', 'C:/repo')
  const planPrompt = buildChatSystemPrompt('plan', 'C:/repo')

  assert.match(agentPrompt, /<agent_mode_prompt>/u)
  assert.match(agentPrompt, /## Required Workflow For Code Changes/u)
  assert.match(agentPrompt, /Act as Echo, a senior production-grade software engineering agent/u)
  assert.match(agentPrompt, /<user_specific_instructions>/u)
  assert.match(agentPrompt, /Here are the specific workspace instructions from the project root AGENTS\.md\./u)
  assert.match(agentPrompt, /<agents\.md_content_here>/u)
  assert.match(agentPrompt, /WHEN ADDING PACKAGES ALWAYS USE npm install to get latest/u)
  assert.match(agentPrompt, /## Engineering Principles/u)
  assert.match(agentPrompt, /simplest correct implementation that is modular, DRY, and easy to extend/u)

  assert.match(planPrompt, /<plan_mode_prompt>/u)
  assert.match(planPrompt, /Act as Echo, a senior production-grade software engineering planner focused on understanding requests, gathering context, and turning ambiguity into a clear implementation plan\./u)
  assert.match(planPrompt, /best practical plan: complete, accurate, modular, DRY, and simple enough to execute without over-engineering/u)
  assert.match(planPrompt, /## Engineering Principles/u)
  assert.match(planPrompt, /## Planning Rules/u)
  assert.match(planPrompt, /Be context-first\. Read the minimum necessary repository context before proposing any plan\./u)
  assert.match(planPrompt, /Translate the request into a concrete implementation plan that names the affected files or modules, the sequence of changes, and the main risks\./u)
  assert.match(planPrompt, /<user_specific_instructions>/u)
  assert.match(planPrompt, /WHEN ADDING PACKAGES ALWAYS USE npm install to get latest/u)
})

test('buildChatPrompt preserves assistant tool calls and matching tool results', () => {
  const messages: Message[] = [
    {
      content: 'Inspect the file',
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
          argumentsText: JSON.stringify({ absolute_path: 'C:/repo/src/example.ts' }),
          completedAt: 3,
          id: 'tool-call-1',
          resultContent: '',
          startedAt: 2,
          state: 'completed',
          toolName: 'read',
        },
      ],
    },
    {
      content: formatStructuredToolResultContent(
        {
          arguments: {
            absolute_path: 'C:/repo/src/example.ts',
          },
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          subject: {
            kind: 'file',
            path: 'src/example.ts',
          },
          summary: 'Read src/example.ts',
          toolCallId: 'tool-call-1',
          toolName: 'read',
        },
        'Path: C:/repo/src/example.ts\n\n1: export const value = 1;',
      ),
      id: 'tool-message-1',
      role: 'tool',
      timestamp: 4,
      toolCallId: 'tool-call-1',
    },
  ]

  const prompt = buildChatPrompt({
    chatMode: 'agent',
    messages,
    workspaceRootPath: 'C:/repo',
  })

  assert.equal(prompt.messages.length, 3)
  assert.match(prompt.system, /Workspace root: C:\/repo/u)

  const assistantMessage = prompt.messages[1]
  assert.equal(assistantMessage?.role, 'assistant')
  assert.ok(Array.isArray(assistantMessage?.content))
  assert.equal(assistantMessage?.content[0]?.type, 'tool-call')
  assert.deepEqual(assistantMessage?.content[0]?.input, {
    absolute_path: 'C:/repo/src/example.ts',
  })

  const toolMessage = prompt.messages[2]
  assert.equal(toolMessage?.role, 'tool')
  assert.ok(Array.isArray(toolMessage?.content))
  assert.equal(toolMessage?.content[0]?.type, 'tool-result')
  assert.deepEqual(toolMessage?.content[0]?.output, {
    type: 'text',
    value: 'Path: C:/repo/src/example.ts\n\n1: export const value = 1;',
  })
})

test('buildChatPrompt combines consecutive tool messages into one replay message', () => {
  const messages: Message[] = [
    {
      content: 'Inspect the files',
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
          argumentsText: JSON.stringify({ absolute_path: 'C:/repo/src/one.ts' }),
          completedAt: 3,
          id: 'tool-call-1',
          resultContent: '',
          startedAt: 2,
          state: 'completed',
          toolName: 'read',
        },
        {
          argumentsText: JSON.stringify({ absolute_path: 'C:/repo/src/two.ts' }),
          completedAt: 4,
          id: 'tool-call-2',
          resultContent: '',
          startedAt: 3,
          state: 'completed',
          toolName: 'read',
        },
        {
          argumentsText: JSON.stringify({ pattern: 'export' }),
          completedAt: 5,
          id: 'tool-call-3',
          resultContent: '',
          startedAt: 4,
          state: 'completed',
          toolName: 'grep',
        },
      ],
    },
    {
      content: formatStructuredToolResultContent(
        {
          arguments: {
            absolute_path: 'C:/repo/src/one.ts',
          },
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          subject: {
            kind: 'file',
            path: 'src/one.ts',
          },
          summary: 'Read src/one.ts',
          toolCallId: 'tool-call-1',
          toolName: 'read',
        },
        'Path: C:/repo/src/one.ts\n\n1: export const one = 1;',
      ),
      id: 'tool-message-1',
      role: 'tool',
      timestamp: 4,
      toolCallId: 'tool-call-1',
    },
    {
      content: formatStructuredToolResultContent(
        {
          arguments: {
            absolute_path: 'C:/repo/src/two.ts',
          },
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          subject: {
            kind: 'file',
            path: 'src/two.ts',
          },
          summary: 'Read src/two.ts',
          toolCallId: 'tool-call-2',
          toolName: 'read',
        },
        'Path: C:/repo/src/two.ts\n\n1: export const two = 2;',
      ),
      id: 'tool-message-2',
      role: 'tool',
      timestamp: 5,
      toolCallId: 'tool-call-2',
    },
    {
      content: formatStructuredToolResultContent(
        {
          arguments: {
            pattern: 'export',
          },
          schema: 'echosphere.tool_result/v1',
          status: 'success',
          summary: 'Found 2 matches for export',
          toolCallId: 'tool-call-3',
          toolName: 'grep',
        },
        'Found 2 matches',
      ),
      id: 'tool-message-3',
      role: 'tool',
      timestamp: 6,
      toolCallId: 'tool-call-3',
    },
  ]

  const prompt = buildChatPrompt({
    chatMode: 'agent',
    messages,
    workspaceRootPath: 'C:/repo',
  })

  assert.equal(prompt.messages.length, 3)
  const toolMessage = prompt.messages[2]
  assert.equal(toolMessage?.role, 'tool')
  assert.ok(Array.isArray(toolMessage?.content))
  assert.equal(toolMessage?.content.length, 3)
  assert.deepEqual(toolMessage?.content.map((part) => part.toolCallId), ['tool-call-1', 'tool-call-2', 'tool-call-3'])
})
