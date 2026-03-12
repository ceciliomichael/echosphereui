import type { ProviderStreamContext } from '../providerTypes'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
import { createCodexStreamAccumulator, type CodexStreamTurnResult } from './codexSseAccumulator'

interface ParseSseResponseStreamOptions {
  onToolCallReady?: (toolCall: OpenAICompatibleToolCall) => void
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

export async function parseSseResponseStream(
  response: Response,
  emitDelta: ProviderStreamContext['emitDelta'],
  signal: AbortSignal,
  options: ParseSseResponseStreamOptions = {},
): Promise<CodexStreamTurnResult> {
  if (!response.body) {
    throw new Error('Codex returned an empty streaming response body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const accumulator = createCodexStreamAccumulator(emitDelta, options)
  let pendingBuffer = ''

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
        return accumulator.buildResult()
      }

      try {
        accumulator.consumePayload(JSON.parse(dataBlock) as unknown)
      } catch {
        // Ignore malformed event payloads and continue consuming the stream.
      }
    }
  }

  if (signal.aborted) {
    return accumulator.buildResult()
  }

  const finalChunk = pendingBuffer + decoder.decode()
  if (finalChunk.trim().length > 0) {
    const finalDataBlock = parseSseEventBlock(finalChunk)
    if (finalDataBlock && finalDataBlock !== '[DONE]') {
      try {
        accumulator.consumePayload(JSON.parse(finalDataBlock) as unknown)
      } catch {
        // Ignore malformed final payloads.
      }
    }
  }

  return accumulator.buildResult()
}
