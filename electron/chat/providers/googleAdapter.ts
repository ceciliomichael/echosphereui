import type { Content, GenerateContentResponse, Part } from '@google/genai/web'
import type { Message, ReasoningEffort } from '../../../src/types/chat'
import { streamAgentLoopWithTools, type AgentLoopTurnOptions } from '../agentLoop/runtime'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import type { ChatProviderAdapter } from '../providerTypes'
import {
  getUserMessageImageAttachments,
  getUserMessageTextBlocks,
  parseInlineImageData,
} from './messageAttachments'
import {
  buildGoogleToolDefinitions,
  parseToolArgumentsTextToObject,
  toGoogleFunctionCallingMode,
} from './providerNativeTools'
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

function buildGoogleUserParts(message: Message): Part[] {
  const parts: Part[] = []

  for (const textBlock of getUserMessageTextBlocks(message)) {
    parts.push({ text: textBlock })
  }

  for (const attachment of getUserMessageImageAttachments(message)) {
    const inlineImage = parseInlineImageData(attachment)
    if (!inlineImage) {
      parts.push({ text: `[Attached image: ${attachment.fileName}]` })
      continue
    }

    parts.push({
      inlineData: {
        data: inlineImage.base64Data,
        mimeType: inlineImage.mimeType,
      },
    })
  }

  return parts
}

function toGoogleContent(message: Message): Content | null {
  const parts = message.role === 'assistant' ? [{ text: message.content }] : buildGoogleUserParts(message)
  const hasVisiblePart = parts.some((part) => typeof part.text === 'string' || part.inlineData !== undefined)
  if (!hasVisiblePart) {
    return null
  }

  return {
    parts,
    role: message.role === 'assistant' ? 'model' : 'user',
  }
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function buildGoogleContents(messages: Message[], pendingToolCallsById: Map<string, OpenAICompatibleToolCall>) {
  const contents: Content[] = []
  const pendingToolMessages: Message[] = []

  const flushPendingToolMessages = () => {
    if (pendingToolMessages.length === 0) {
      return
    }

    const knownToolCalls: OpenAICompatibleToolCall[] = []
    const toolResponseParts: Part[] = []
    const fallbackTextParts: Part[] = []

    for (const toolMessage of pendingToolMessages) {
      const toolCallId = hasText(toolMessage.toolCallId) ? toolMessage.toolCallId : null
      const toolCall = toolCallId ? pendingToolCallsById.get(toolCallId) ?? null : null

      if (toolCall) {
        knownToolCalls.push(toolCall)
        toolResponseParts.push({
          functionResponse: {
            id: toolCall.id,
            name: toolCall.name,
            response: {
              output: toolMessage.content,
            },
          },
        })
        pendingToolCallsById.delete(toolCall.id)
        continue
      }

      if (hasText(toolMessage.content)) {
        fallbackTextParts.push({
          text: toolMessage.content,
        })
      }
    }

    if (knownToolCalls.length > 0) {
      contents.push({
        parts: knownToolCalls.map((toolCall) => ({
          functionCall: {
            args: parseToolArgumentsTextToObject(toolCall.argumentsText),
            id: toolCall.id,
            name: toolCall.name,
          },
        })),
        role: 'model',
      })
    }

    const userParts = [...toolResponseParts, ...fallbackTextParts]
    if (userParts.length > 0) {
      contents.push({
        parts: userParts,
        role: 'user',
      })
    }

    pendingToolMessages.length = 0
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolMessages.push(message)
      continue
    }

    flushPendingToolMessages()
    const content = toGoogleContent(message)
    if (content) {
      contents.push(content)
    }
  }

  flushPendingToolMessages()
  return contents
}

interface GoogleToolCallAccumulator {
  argumentsText: string
  id: string
  name: string
  startedAt: number
}

interface GoogleStreamTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

function emitGoogleStreamChunkDeltas(
  chunk: GenerateContentResponse,
  partSnapshots: Map<string, string>,
  toolCallAccumulatorsByPart: Map<string, GoogleToolCallAccumulator>,
  toolCallsInOrder: string[],
  emitDelta: (event: {
    argumentsText?: string
    delta?: string
    invocationId?: string
    startedAt?: number
    toolName?: string
    type: 'content_delta' | 'reasoning_delta' | 'tool_invocation_delta' | 'tool_invocation_started'
  }) => void,
) {
  const candidates = chunk.candidates ?? []

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const parts = candidate.content?.parts ?? []

    for (const [partIndex, part] of parts.entries()) {
      if (part.functionCall?.name) {
        const toolCallKey = `${candidateIndex}:${partIndex}`
        const toolCallId = part.functionCall.id?.trim() || `${toolCallKey}:${part.functionCall.name}`
        const argumentsText = JSON.stringify(part.functionCall.args ?? {})
        const existingAccumulator = toolCallAccumulatorsByPart.get(toolCallKey)

        if (!existingAccumulator) {
          const nextAccumulator: GoogleToolCallAccumulator = {
            argumentsText,
            id: toolCallId,
            name: part.functionCall.name,
            startedAt: Date.now(),
          }
          toolCallAccumulatorsByPart.set(toolCallKey, nextAccumulator)
          toolCallsInOrder.push(toolCallKey)
          emitDelta({
            argumentsText,
            invocationId: nextAccumulator.id,
            startedAt: nextAccumulator.startedAt,
            toolName: nextAccumulator.name,
            type: 'tool_invocation_started',
          })
        } else if (existingAccumulator.argumentsText !== argumentsText) {
          existingAccumulator.argumentsText = argumentsText
          emitDelta({
            argumentsText,
            invocationId: existingAccumulator.id,
            toolName: existingAccumulator.name,
            type: 'tool_invocation_delta',
          })
        }
      }

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
    chatMode: 'agent' | 'plan'
    forceToolChoice?: 'none' | 'required'
    messages: Message[]
    modelId: string
    reasoningEffort: ReasoningEffort
  },
  pendingToolCallsById: Map<string, OpenAICompatibleToolCall>,
  emitDelta: (event: {
    argumentsText?: string
    delta?: string
    invocationId?: string
    startedAt?: number
    toolName?: string
    type: 'content_delta' | 'reasoning_delta' | 'tool_invocation_delta' | 'tool_invocation_started'
  }) => void,
  signal: AbortSignal,
  _options: AgentLoopTurnOptions = {},
) {
  const contents = buildGoogleContents(request.messages, pendingToolCallsById)
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
      toolConfig: {
        functionCallingConfig: {
          mode: toGoogleFunctionCallingMode(request.forceToolChoice),
        },
      },
      tools: buildGoogleToolDefinitions(request.chatMode),
    },
    contents,
    model: resolvedModelId,
  })

  const partSnapshots = new Map<string, string>()
  const toolCallAccumulatorsByPart = new Map<string, GoogleToolCallAccumulator>()
  const toolCallsInOrder: string[] = []
  const assistantContentDeltas: string[] = []
  for await (const chunk of stream) {
    emitGoogleStreamChunkDeltas(
      chunk,
      partSnapshots,
      toolCallAccumulatorsByPart,
      toolCallsInOrder,
      (event) => {
        if (event.type === 'content_delta' && event.delta) {
          assistantContentDeltas.push(event.delta)
        }
        emitDelta(event)
      },
    )
  }

  return {
    assistantContent: assistantContentDeltas.join(''),
    toolCalls: toolCallsInOrder
      .map((key) => toolCallAccumulatorsByPart.get(key))
      .filter((toolCall): toolCall is GoogleToolCallAccumulator => toolCall !== undefined)
      .map((toolCall) => ({
        argumentsText: toolCall.argumentsText,
        id: toolCall.id,
        name: toolCall.name,
        startedAt: toolCall.startedAt,
      })),
  } satisfies GoogleStreamTurnResult
}

export const googleChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'google',
  async streamResponse(request, context) {
    const providerConfig = await loadGoogleProviderConfig()
    const client = buildGoogleClient(providerConfig)
    const pendingToolCallsById = new Map<string, OpenAICompatibleToolCall>()

    try {
      await streamAgentLoopWithTools(
        {
          agentContextRootPath: request.agentContextRootPath,
          chatMode: request.chatMode,
          messages: request.messages,
          modelId: request.modelId,
          providerId: 'google',
          reasoningEffort: request.reasoningEffort,
          terminalExecutionMode: request.terminalExecutionMode,
        },
        context,
        async (turnRequest, turnContext, options) => {
          const turnResult = await streamGoogleResponse(
            client,
            {
              chatMode: turnRequest.chatMode,
              forceToolChoice: turnRequest.forceToolChoice,
              messages: turnRequest.messages,
              modelId: turnRequest.modelId,
              reasoningEffort: turnRequest.reasoningEffort,
            },
            pendingToolCallsById,
            (event) => {
              if (event.type === 'content_delta' && event.delta) {
                turnContext.emitDelta({
                  delta: event.delta,
                  type: 'content_delta',
                })
                return
              }

              if (event.type === 'reasoning_delta' && event.delta) {
                turnContext.emitDelta({
                  delta: event.delta,
                  type: 'reasoning_delta',
                })
                return
              }

              if (event.type === 'tool_invocation_started' && event.argumentsText && event.invocationId && event.toolName && event.startedAt) {
                turnContext.emitDelta({
                  argumentsText: event.argumentsText,
                  invocationId: event.invocationId,
                  startedAt: event.startedAt,
                  toolName: event.toolName,
                  type: 'tool_invocation_started',
                })
                return
              }

              if (event.type === 'tool_invocation_delta' && event.argumentsText && event.invocationId && event.toolName) {
                turnContext.emitDelta({
                  argumentsText: event.argumentsText,
                  invocationId: event.invocationId,
                  toolName: event.toolName,
                  type: 'tool_invocation_delta',
                })
              }
            },
            turnContext.signal,
            options,
          )
          pendingToolCallsById.clear()
          for (const toolCall of turnResult.toolCalls) {
            pendingToolCallsById.set(toolCall.id, toolCall)
          }

          return {
            assistantContent: turnResult.assistantContent,
            toolCalls: turnResult.toolCalls,
          }
        },
      )
    } catch (error) {
      if (context.signal.aborted) {
        return
      }

      throw error
    }
  },
}
