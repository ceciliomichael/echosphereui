import type { StreamDeltaEvent } from '../providerTypes'

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

  return {
    buildRequestOverrides(): OpenAICompatibleResponsesRequestOverrides {
      if (previousResponseId === null) {
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

      pendingToolOutputs.push({
        call_id: event.invocationId,
        output: event.resultContent,
        type: 'function_call_output',
      })
    },
    setPreviousResponseId(responseId: string) {
      previousResponseId = responseId
    },
  }
}
