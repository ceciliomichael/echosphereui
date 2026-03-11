import type { Content, GenerateContentResponse } from '@google/genai/web'
import type { Message, ReasoningEffort } from '../../../src/types/chat'
import type { ChatProviderAdapter } from '../providerTypes'
import {
  buildGoogleClient,
  GOOGLE_MAX_RETRIES,
  GOOGLE_REQUEST_TIMEOUT_MS,
  GOOGLE_SYSTEM_INSTRUCTIONS,
  googleModelSupportsReasoningEffort,
  loadGoogleProviderConfig,
  resolveGoogleModelId,
  toGoogleThinkingLevel,
} from './googleShared'

function toGoogleContent(message: Message): Content | null {
  const content = message.content.trim()
  if (content.length === 0) {
    return null
  }

  return {
    parts: [{ text: content }],
    role: message.role === 'assistant' ? 'model' : 'user',
  }
}

function buildGoogleContents(messages: Message[]) {
  return messages.map(toGoogleContent).filter((value): value is Content => value !== null)
}

function emitGoogleStreamChunkDeltas(
  chunk: GenerateContentResponse,
  partSnapshots: Map<string, string>,
  emitDelta: (event: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
) {
  const candidates = chunk.candidates ?? []

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const parts = candidate.content?.parts ?? []

    for (const [partIndex, part] of parts.entries()) {
      const text = part.text
      if (typeof text !== 'string' || text.length === 0) {
        continue
      }

      const isReasoningPart = part.thought === true
      const partKey = `${candidateIndex}:${partIndex}:${isReasoningPart ? 'reasoning' : 'content'}`
      const previousSnapshot = partSnapshots.get(partKey) ?? ''
      const delta = text.startsWith(previousSnapshot) ? text.slice(previousSnapshot.length) : text
      if (delta.length === 0) {
        partSnapshots.set(partKey, text)
        continue
      }

      partSnapshots.set(partKey, text)
      emitDelta({
        delta,
        type: isReasoningPart ? 'reasoning_delta' : 'content_delta',
      })
    }
  }
}

async function streamGoogleResponse(
  client: ReturnType<typeof buildGoogleClient>,
  request: {
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  emitDelta: (event: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
  signal: AbortSignal,
) {
  const contents = buildGoogleContents(request.messages)
  if (contents.length === 0) {
    throw new Error('Google Gemini requests require at least one non-empty message.')
  }

  const resolvedModelId = resolveGoogleModelId(request.modelId)
  const supportsReasoningEffort = googleModelSupportsReasoningEffort(resolvedModelId)
  const stream = await client.models.generateContentStream({
    config: {
      abortSignal: signal,
      httpOptions: {
        retryOptions: {
          attempts: GOOGLE_MAX_RETRIES + 1,
        },
        timeout: GOOGLE_REQUEST_TIMEOUT_MS,
      },
      systemInstruction: GOOGLE_SYSTEM_INSTRUCTIONS,
      ...(supportsReasoningEffort
        ? {
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: toGoogleThinkingLevel(request.reasoningEffort),
            },
          }
        : {}),
    },
    contents,
    model: resolvedModelId,
  })

  const partSnapshots = new Map<string, string>()
  for await (const chunk of stream) {
    emitGoogleStreamChunkDeltas(chunk, partSnapshots, emitDelta)
  }
}

export const googleChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'google',
  async streamResponse(request, context) {
    const providerConfig = await loadGoogleProviderConfig()
    const client = buildGoogleClient(providerConfig)

    try {
      await streamGoogleResponse(
        client,
        {
          messages: request.messages,
          modelId: request.modelId,
          reasoningEffort: request.reasoningEffort,
        },
        context.emitDelta,
        context.signal,
      )
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      throw error
    }
  },
}
