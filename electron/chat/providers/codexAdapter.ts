import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import type { ChatProviderAdapter } from '../providerTypes'
import { forceRefreshCodexAuthData, loadCodexAuthData } from './codexAuth'

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_VERSION_HEADER = '0.101.0'
const CODEX_USER_AGENT = 'codex_cli_rs/0.101.0 (Windows; x86_64)'
const CODEX_ORIGINATOR = 'codex_cli_rs'

interface CodexMessageContentItem {
  text: string
  type: 'input_text' | 'output_text'
}

interface CodexInputMessage {
  content: CodexMessageContentItem[]
  role: 'assistant' | 'user'
}

interface CodexStreamEventPayload {
  [key: string]: unknown
  delta?: unknown
  text?: unknown
  type?: unknown
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function toCodexInputMessage(message: Message): CodexInputMessage | null {
  if (message.role === 'tool') {
    return null
  }

  if (!hasText(message.content)) {
    return null
  }

  if (message.role === 'user') {
    return {
      role: 'user',
      content: [{ text: message.content, type: 'input_text' }],
    }
  }

  return {
    role: 'assistant',
    content: [{ text: message.content, type: 'output_text' }],
  }
}

function buildCodexPayload(messages: Message[], modelId: string, reasoningEffort: string) {
  return {
    include: ['reasoning.encrypted_content'],
    input: messages.map(toCodexInputMessage).filter((value): value is CodexInputMessage => value !== null),
    instructions: 'You are EchoSphere, a helpful coding assistant.',
    model: modelId,
    parallel_tool_calls: true,
    reasoning: {
      effort: reasoningEffort,
      summary: 'auto',
    },
    store: false,
    stream: true,
  }
}

function buildCodexHeaders(accessToken: string, accountId: string) {
  return {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${accessToken}`,
    'Chatgpt-Account-Id': accountId,
    'Content-Type': 'application/json',
    Originator: CODEX_ORIGINATOR,
    Session_id: randomUUID(),
    'User-Agent': CODEX_USER_AGENT,
    Version: CODEX_VERSION_HEADER,
  }
}

function parseSseEventBlock(eventBlock: string) {
  const lines = eventBlock.split(/\r?\n/)
  const dataLines: string[] = []

  for (const line of lines) {
    const normalizedLine = line.trimStart()
    if (normalizedLine.startsWith('data:')) {
      dataLines.push(normalizedLine.slice('data:'.length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return dataLines.join('\n')
}

function readDeltaText(input: unknown): string | null {
  if (typeof input === 'string' && input.length > 0) {
    return input
  }

  if (typeof input !== 'object' || input === null) {
    return null
  }

  const candidate = input as Record<string, unknown>
  if (typeof candidate.delta === 'string' && candidate.delta.length > 0) {
    return candidate.delta
  }

  if (typeof candidate.text === 'string' && candidate.text.length > 0) {
    return candidate.text
  }

  return null
}

function readNestedRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

function extractReasoningTextFromOutputItem(payload: CodexStreamEventPayload): string | null {
  const item = readNestedRecord(payload.item)
  if (!item) {
    return null
  }

  const itemType = item.type
  if (typeof itemType !== 'string' || (!itemType.includes('reasoning') && !itemType.includes('summary'))) {
    return null
  }

  const directText = readDeltaText(item.text) ?? readDeltaText(item.delta)
  if (directText) {
    return directText
  }

  const summary = item.summary
  if (!Array.isArray(summary)) {
    return null
  }

  const summaryText = summary
    .map((entry) => {
      const summaryEntry = readNestedRecord(entry)
      if (!summaryEntry) {
        return null
      }

      return readDeltaText(summaryEntry.text) ?? readDeltaText(summaryEntry.delta)
    })
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('')

  return summaryText.length > 0 ? summaryText : null
}

function extractReasoningTextFromContentPart(payload: CodexStreamEventPayload): string | null {
  const part = readNestedRecord(payload.part)
  const partType = part?.type
  if (typeof partType !== 'string' || (!partType.includes('reasoning') && !partType.includes('summary'))) {
    return null
  }

  return readDeltaText(payload.delta) ?? readDeltaText(part?.text) ?? readDeltaText(part?.delta)
}

function handleStreamEventPayload(
  payload: CodexStreamEventPayload,
  emitDelta: (event: {
    delta: string
    isNewReasoningBlock?: boolean
    sourceEventType?: string
    type: 'content_delta' | 'reasoning_delta'
  }) => void,
) {
  const eventType = payload.type
  if (!hasText(eventType)) {
    return
  }

  if (eventType === 'response.output_text.delta') {
    const delta = readDeltaText(payload.delta) ?? readDeltaText(payload.text)
    if (!delta) {
      return
    }

    emitDelta({
      delta,
      type: 'content_delta',
    })
    return
  }

  if (eventType === 'response.reasoning_summary_text.delta') {
    const delta = readDeltaText(payload.delta) ?? readDeltaText(payload.text)
    if (!delta) {
      return
    }

    emitDelta({
      delta,
      isNewReasoningBlock: false,
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
    return
  }

  if (eventType === 'response.output_item.added') {
    const outputItemReasoningText = extractReasoningTextFromOutputItem(payload)
    if (!outputItemReasoningText) {
      return
    }

    emitDelta({
      delta: outputItemReasoningText,
      isNewReasoningBlock: true,
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
    return
  }

  if (eventType === 'response.content_part.added' || eventType === 'response.content_part.delta') {
    const contentPartReasoningText = extractReasoningTextFromContentPart(payload)
    if (!contentPartReasoningText) {
      return
    }

    emitDelta({
      delta: contentPartReasoningText,
      isNewReasoningBlock: eventType === 'response.content_part.added',
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
  }
}

async function parseSseResponseStream(
  response: Response,
  emitDelta: (event: { delta: string; type: 'content_delta' | 'reasoning_delta' }) => void,
  signal: AbortSignal,
) {
  if (!response.body) {
    throw new Error('Codex returned an empty streaming response body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pendingBuffer = ''
  let hasReasoningContent = false
  let shouldPrefixNextReasoningSummaryDelta = false

  const blockSeparatorPattern = /\r?\n\r?\n/

  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    pendingBuffer += decoder.decode(value, { stream: true })
    let separatorMatch = pendingBuffer.match(blockSeparatorPattern)
    while (separatorMatch && separatorMatch.index !== undefined) {
      const separatorIndex = separatorMatch.index
      const separatorLength = separatorMatch[0].length
      const eventBlock = pendingBuffer.slice(0, separatorIndex)
      pendingBuffer = pendingBuffer.slice(separatorIndex + separatorLength)
      separatorMatch = pendingBuffer.match(blockSeparatorPattern)

      const dataBlock = parseSseEventBlock(eventBlock)
      if (!dataBlock) {
        continue
      }

      if (dataBlock === '[DONE]') {
        return
      }

      try {
        const payload = JSON.parse(dataBlock) as CodexStreamEventPayload
        const payloadType = typeof payload.type === 'string' ? payload.type : ''
        if (payloadType === 'response.reasoning_summary_text.done') {
          shouldPrefixNextReasoningSummaryDelta = true
        }

        handleStreamEventPayload(payload, (event) => {
          if (event.type !== 'reasoning_delta') {
            emitDelta(event)
            return
          }

          const shouldPrefixNewline =
            (Boolean(event.isNewReasoningBlock) ||
              (shouldPrefixNextReasoningSummaryDelta && event.sourceEventType === 'response.reasoning_summary_text.delta')) &&
            hasReasoningContent &&
            event.delta.trim().length > 0 &&
            !event.delta.startsWith('\n')

          const normalizedDelta = shouldPrefixNewline ? `\n\n${event.delta}` : event.delta
          if (normalizedDelta.trim().length > 0) {
            hasReasoningContent = true
            shouldPrefixNextReasoningSummaryDelta = false
          }

          emitDelta({
            delta: normalizedDelta,
            type: 'reasoning_delta',
          })
        })
      } catch {
        // Ignore malformed event payloads and continue consuming the stream.
      }
    }
  }

  if (signal.aborted) {
    return
  }

  const finalChunk = pendingBuffer + decoder.decode()
  if (finalChunk.trim().length === 0) {
    return
  }

  const finalDataBlock = parseSseEventBlock(finalChunk)
  if (!finalDataBlock || finalDataBlock === '[DONE]') {
    return
  }

  try {
    const payload = JSON.parse(finalDataBlock) as CodexStreamEventPayload
    const payloadType = typeof payload.type === 'string' ? payload.type : ''
    if (payloadType === 'response.reasoning_summary_text.done') {
      shouldPrefixNextReasoningSummaryDelta = true
    }

    handleStreamEventPayload(payload, (event) => {
      if (event.type !== 'reasoning_delta') {
        emitDelta(event)
        return
      }

      const shouldPrefixNewline =
        (Boolean(event.isNewReasoningBlock) ||
          (shouldPrefixNextReasoningSummaryDelta && event.sourceEventType === 'response.reasoning_summary_text.delta')) &&
        hasReasoningContent &&
        event.delta.trim().length > 0 &&
        !event.delta.startsWith('\n')

      const normalizedDelta = shouldPrefixNewline ? `\n\n${event.delta}` : event.delta
      if (normalizedDelta.trim().length > 0) {
        hasReasoningContent = true
        shouldPrefixNextReasoningSummaryDelta = false
      }

      emitDelta({
        delta: normalizedDelta,
        type: 'reasoning_delta',
      })
    })
  } catch {
    // Ignore malformed final payloads.
  }
}

async function sendCodexStreamingRequest(
  payload: ReturnType<typeof buildCodexPayload>,
  signal: AbortSignal,
  forceRefresh = false,
) {
  const authData = forceRefresh ? await forceRefreshCodexAuthData() : await loadCodexAuthData()
  const response = await fetch(CODEX_RESPONSES_URL, {
    method: 'POST',
    headers: buildCodexHeaders(authData.tokens.access_token, authData.tokens.account_id),
    body: JSON.stringify(payload),
    signal,
  })

  if (response.status === 401 && !forceRefresh) {
    return sendCodexStreamingRequest(payload, signal, true)
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Codex request failed (${response.status}): ${errorText}`)
  }

  return response
}

export const codexChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'codex',
  async streamResponse(request, context) {
    const payload = buildCodexPayload(request.messages, request.modelId, request.reasoningEffort)
    const response = await sendCodexStreamingRequest(payload, context.signal)
    await parseSseResponseStream(response, context.emitDelta, context.signal)
  },
}
