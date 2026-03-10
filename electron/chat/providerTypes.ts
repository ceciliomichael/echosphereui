import type { ChatProviderId, Message, ReasoningEffort } from '../../src/types/chat'

export type StreamDeltaEvent =
  | {
      delta: string
      type: 'content_delta'
    }
  | {
      delta: string
      type: 'reasoning_delta'
    }

export interface ProviderStreamRequest {
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
