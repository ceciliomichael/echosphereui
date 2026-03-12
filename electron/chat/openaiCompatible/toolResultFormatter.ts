import { randomUUID } from 'node:crypto'
import type { Message, ToolInvocationTrace } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from './toolTypes'

function formatJsonBlock(value: Record<string, unknown>) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function formatArgumentsText(argumentsText: string) {
  if (argumentsText.trim().length === 0) {
    return '{}'
  }

  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    if (typeof parsedValue !== 'object' || parsedValue === null) {
      return argumentsText
    }

    return JSON.stringify(parsedValue, null, 2)
  } catch {
    return argumentsText
  }
}

export function buildStartedToolInvocation(toolCall: OpenAICompatibleToolCall, startedAt: number): ToolInvocationTrace {
  return {
    argumentsText: formatArgumentsText(toolCall.argumentsText),
    id: toolCall.id,
    startedAt,
    state: 'running',
    toolName: toolCall.name,
  }
}

export function buildSuccessfulToolArtifacts(
  toolCall: OpenAICompatibleToolCall,
  semanticResult: Record<string, unknown>,
  startedAt: number,
  completedAt: number,
) {
  const payload = {
    ok: true,
    result: semanticResult,
    toolName: toolCall.name,
  } satisfies Record<string, unknown>
  const resultContent = formatJsonBlock(payload)
  const syntheticMessage: Message = {
    content: `Tool result for ${toolCall.name}:\n${resultContent}`,
    id: randomUUID(),
    role: 'tool',
    timestamp: completedAt,
    toolCallId: toolCall.id,
  }

  return {
    resultContent,
    syntheticMessage,
    toolInvocation: {
      argumentsText: formatArgumentsText(toolCall.argumentsText),
      completedAt,
      id: toolCall.id,
      resultContent,
      startedAt,
      state: 'completed',
      toolName: toolCall.name,
    } satisfies ToolInvocationTrace,
  }
}

export function buildFailedToolArtifacts(
  toolCall: OpenAICompatibleToolCall,
  errorMessage: string,
  startedAt: number,
  completedAt: number,
  details?: Record<string, unknown>,
) {
  const payload = {
    ...(details ? { details } : {}),
    error: errorMessage,
    ok: false,
    toolName: toolCall.name,
  } satisfies Record<string, unknown>
  const resultContent = formatJsonBlock(payload)
  const syntheticMessage: Message = {
    content: `Tool result for ${toolCall.name}:\n${resultContent}`,
    id: randomUUID(),
    role: 'tool',
    timestamp: completedAt,
    toolCallId: toolCall.id,
  }

  return {
    resultContent,
    syntheticMessage,
    toolInvocation: {
      argumentsText: formatArgumentsText(toolCall.argumentsText),
      completedAt,
      id: toolCall.id,
      resultContent,
      startedAt,
      state: 'failed',
      toolName: toolCall.name,
    } satisfies ToolInvocationTrace,
  }
}
