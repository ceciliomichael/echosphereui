import { randomUUID } from 'node:crypto'
import { formatStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import type { Message, ToolInvocationTrace } from '../../../src/types/chat'
import { buildResultPresentation, formatFailureResultBody, formatSuccessResultBody } from './toolResultBodies'
import { buildFailureMetadata, buildSuccessMetadata } from './toolResultMetadata'
export { buildCodexGroupedToolResultContent } from './toolResultGrouping'
import { formatArgumentsText } from './toolResultSupport'
import type { OpenAICompatibleToolCall } from './toolTypes'

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
  const resultBody = formatSuccessResultBody(toolCall.name, semanticResult)
  const resultContent = formatStructuredToolResultContent(buildSuccessMetadata(toolCall, semanticResult), resultBody)
  const resultPresentation = buildResultPresentation(toolCall.name, semanticResult)
  const syntheticMessage: Message = {
    content: resultContent,
    id: randomUUID(),
    role: 'tool',
    timestamp: completedAt,
    toolCallId: toolCall.id,
  }

  return {
    resultContent,
    resultPresentation,
    semanticResult,
    syntheticMessage,
    toolInvocation: {
      argumentsText: formatArgumentsText(toolCall.argumentsText),
      completedAt,
      id: toolCall.id,
      resultContent,
      resultPresentation,
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
  const resultBody = formatFailureResultBody(errorMessage, details)
  const resultContent = formatStructuredToolResultContent(buildFailureMetadata(toolCall, errorMessage, details), resultBody)
  const syntheticMessage: Message = {
    content: resultContent,
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
      resultPresentation: undefined,
      startedAt,
      state: 'failed',
      toolName: toolCall.name,
    } satisfies ToolInvocationTrace,
  }
}
