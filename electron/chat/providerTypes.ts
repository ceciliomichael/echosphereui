import type { ChatMode, ChatProviderId, Message, ReasoningEffort } from '../../src/types/chat'

export type StreamDeltaEvent =
  | {
      delta: string
      type: 'content_delta'
    }
  | {
      delta: string
      type: 'reasoning_delta'
    }
  | {
      argumentsText: string
      invocationId: string
      startedAt: number
      toolName: string
      type: 'tool_invocation_started'
    }
  | {
      argumentsText: string
      completedAt: number
      invocationId: string
      resultContent: string
      syntheticMessage: Message
      toolName: string
      type: 'tool_invocation_completed'
    }
  | {
      argumentsText: string
      completedAt: number
      errorMessage: string
      invocationId: string
      resultContent: string
      syntheticMessage: Message
      toolName: string
      type: 'tool_invocation_failed'
    }

export interface ProviderStreamRequest {
  agentContextRootPath: string
  chatMode: ChatMode
  messages: Message[]
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
}

export interface ProviderStreamContext {
  emitDelta: (event: StreamDeltaEvent) => void
  signal: AbortSignal
}

export interface ChatProviderAdapter {
  providerId: ChatProviderId
  streamResponse: (request: ProviderStreamRequest, context: ProviderStreamContext) => Promise<void>
}
