import type { StreamDeltaEvent } from '../providerTypes'
import { getToolResultModelContent } from '../../../src/lib/toolResultContent'
import { parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'

export interface OpenAICompatibleResponsesFunctionCallOutputInput {
  call_id: string
  output: string
  type: 'function_call_output'
}

export interface OpenAICompatibleResponsesRequestOverrides {
  input?: OpenAICompatibleResponsesFunctionCallOutputInput[]
  previousResponseId?: string | null
}

function isToolOutputEvent(
  event: StreamDeltaEvent,
): event is Extract<StreamDeltaEvent, { type: 'tool_invocation_completed' | 'tool_invocation_failed' }> {
  return event.type === 'tool_invocation_completed' || event.type === 'tool_invocation_failed'
}

function shouldResetResponsesChainForResult(resultContent: string) {
  const toolName = parseStructuredToolResultContent(resultContent).metadata?.toolName ?? null
  return (
    toolName === 'read' ||
    toolName === 'write' ||
    toolName === 'edit' ||
    toolName === 'apply_patch' ||
    toolName === 'file_change'
  )
}

export function buildResponsesFunctionCallOutputItems(
  toolOutputs: OpenAICompatibleResponsesFunctionCallOutputInput[],
) {
  return toolOutputs.map((toolOutput) => ({
    call_id: toolOutput.call_id,
    output: toolOutput.output,
    type: 'function_call_output' as const,
  }))
}

export function createOpenAICompatibleResponsesLoopState() {
  const pendingToolOutputs: OpenAICompatibleResponsesFunctionCallOutputInput[] = []
  let previousResponseId: string | null = null
  let shouldRebuildFromMessageHistory = false

  return {
    buildRequestOverrides(): OpenAICompatibleResponsesRequestOverrides {
      if (previousResponseId === null) {
        return {}
      }

      if (shouldRebuildFromMessageHistory) {
        pendingToolOutputs.length = 0
        shouldRebuildFromMessageHistory = false
        return {}
      }

      const input = buildResponsesFunctionCallOutputItems([...pendingToolOutputs])
      pendingToolOutputs.length = 0
      return {
        input,
        previousResponseId,
      }
    },
    getPreviousResponseId() {
      return previousResponseId
    },
    recordStreamEvent(event: StreamDeltaEvent) {
      if (!isToolOutputEvent(event)) {
        return
      }

      if (shouldResetResponsesChainForResult(event.resultContent)) {
        shouldRebuildFromMessageHistory = true
      }

      pendingToolOutputs.push({
        call_id: event.invocationId,
        output: getToolResultModelContent(event.resultContent),
        type: 'function_call_output',
      })
    },
    setPreviousResponseId(responseId: string) {
      previousResponseId = responseId
    },
  }
}
