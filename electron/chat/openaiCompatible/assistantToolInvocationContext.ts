import type { Message, ToolInvocationTrace } from '../../../src/types/chat'
import { formatArgumentsText } from './toolResultSupport'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function describeToolInvocationState(state: ToolInvocationTrace['state']) {
  if (state === 'completed') {
    return 'completed'
  }

  if (state === 'failed') {
    return 'failed'
  }

  return 'in progress'
}

export function buildAssistantToolInvocationContext(message: Pick<Message, 'role' | 'toolInvocations'>) {
  if (message.role !== 'assistant' || !message.toolInvocations?.length) {
    return null
  }

  const lines = message.toolInvocations
    .filter((invocation) => hasText(invocation.toolName))
    .map((invocation) => {
      const argumentsText = formatArgumentsText(invocation.argumentsText)
      const stateLabel = describeToolInvocationState(invocation.state)
      return `- ${invocation.toolName}(${argumentsText}) ${stateLabel}.`
    })

  if (lines.length === 0) {
    return null
  }

  return [
    'Assistant tool call context from the immediately preceding assistant turn.',
    'Use this to preserve the exact tool requests that led to the results below.',
    ...lines,
  ].join('\n')
}

export function buildSerializedAssistantTurnContent(message: Pick<Message, 'content' | 'role' | 'toolInvocations'>) {
  if (message.role !== 'assistant') {
    return null
  }

  const content = hasText(message.content) ? message.content.trim() : null
  const toolInvocationContext = buildAssistantToolInvocationContext(message)
  const parts = [content, toolInvocationContext].filter((part): part is string => part !== null && part.length > 0)

  if (parts.length === 0) {
    return null
  }

  return parts.join('\n\n')
}
