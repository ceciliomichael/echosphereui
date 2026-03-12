import { randomUUID } from 'node:crypto'
import type { Message } from '../../../src/types/chat'
import {
  buildFailedToolArtifacts,
  buildSuccessfulToolArtifacts,
} from '../openaiCompatible/toolResultFormatter'
import {
  getOpenAICompatibleToolDefinition,
  getOpenAICompatibleToolDefinitions,
} from '../openaiCompatible/toolRegistry'
import {
  OpenAICompatibleToolError,
  type OpenAICompatibleToolCall,
} from '../openaiCompatible/toolTypes'
import { buildSystemPrompt } from '../prompts'
import type {
  ProviderStreamContext,
  ProviderStreamRequest,
  StreamDeltaEvent,
} from '../providerTypes'

export interface CodexFunctionToolDefinition {
  description: string
  name: string
  parameters: Record<string, unknown>
  type: 'function'
}

export interface CodexMessageContentItem {
  text: string
  type: 'input_text' | 'output_text'
}

export interface CodexInputMessage {
  content: CodexMessageContentItem[]
  role: 'assistant' | 'user'
}

export interface CodexRequestPayload {
  include: string[]
  input: CodexInputMessage[]
  instructions: string
  model: string
  parallel_tool_calls: boolean
  reasoning: {
    effort: string
    summary: 'auto'
  }
  store: false
  stream: true
  tool_choice: 'auto'
  tools: CodexFunctionToolDefinition[]
}

interface CodexStreamEventPayload {
  [key: string]: unknown
  arguments?: unknown
  call_id?: unknown
  delta?: unknown
  item?: unknown
  item_id?: unknown
  output_index?: unknown
  part?: unknown
  text?: unknown
  type?: unknown
}

interface CodexToolCallAccumulator {
  argumentsText: string
  id: string
  itemId: string | null
  name: string
  outputIndex: number
  startedAt: number | null
}

export interface CodexStreamTurnResult {
  assistantContent: string
  toolCalls: OpenAICompatibleToolCall[]
}

interface ParsedReasoningEvent {
  delta: string
  isNewReasoningBlock?: boolean
  sourceEventType?: string
  type: 'reasoning_delta'
}

type ContentStreamEvent = Extract<StreamDeltaEvent, { type: 'content_delta' }>
type ToolLifecycleStreamEvent = Extract<
  StreamDeltaEvent,
  | { type: 'tool_invocation_started' }
  | { type: 'tool_invocation_delta' }
>
type ParsedCodexStreamEvent = ContentStreamEvent | ParsedReasoningEvent | ToolLifecycleStreamEvent

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
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

export function toCodexInputMessage(message: Message): CodexInputMessage | null {
  if (!hasText(message.content)) {
    return null
  }

  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: [{ text: message.content, type: 'output_text' }],
    }
  }

  return {
    role: 'user',
    content: [{ text: message.content, type: 'input_text' }],
  }
}

export function getCodexToolDefinitions(): CodexFunctionToolDefinition[] {
  return getOpenAICompatibleToolDefinitions().map((toolDefinition) => {
    if (toolDefinition.tool.type !== 'function') {
      throw new Error(`Unsupported tool type for Codex: ${toolDefinition.tool.type}`)
    }

    return {
      description: toolDefinition.tool.function.description ?? '',
      name: toolDefinition.tool.function.name,
      parameters: toolDefinition.tool.function.parameters as Record<string, unknown>,
      type: 'function',
    }
  })
}

export async function buildCodexPayload(
  request: ProviderStreamRequest,
  messages: Message[],
): Promise<CodexRequestPayload> {
  const instructions = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    supportsNativeTools: true,
  })

  return {
    include: ['reasoning.encrypted_content'],
    input: messages.map(toCodexInputMessage).filter((value): value is CodexInputMessage => value !== null),
    instructions,
    model: request.modelId,
    parallel_tool_calls: true,
    reasoning: {
      effort: request.reasoningEffort,
      summary: 'auto',
    },
    store: false,
    stream: true,
    tool_choice: 'auto',
    tools: getCodexToolDefinitions(),
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

function readCodexToolOutputIndex(payload: CodexStreamEventPayload, item: Record<string, unknown> | null) {
  return readNonNegativeInteger(payload.output_index) ?? readNonNegativeInteger(item?.output_index)
}

function registerToolAccumulatorReferences(
  referenceIndex: Map<string, number>,
  accumulator: CodexToolCallAccumulator,
) {
  referenceIndex.set(accumulator.id, accumulator.outputIndex)

  if (accumulator.itemId) {
    referenceIndex.set(accumulator.itemId, accumulator.outputIndex)
  }
}

function emitToolAccumulatorLifecycleEvent(
  accumulator: CodexToolCallAccumulator,
  previousArgumentsText: string,
  emitDelta: (event: ToolLifecycleStreamEvent) => void,
) {
  if (accumulator.startedAt === null && accumulator.name.trim().length > 0) {
    accumulator.startedAt = Date.now()
    emitDelta({
      argumentsText: accumulator.argumentsText,
      invocationId: accumulator.id,
      startedAt: accumulator.startedAt,
      toolName: accumulator.name,
      type: 'tool_invocation_started',
    })
    return
  }

  if (accumulator.startedAt !== null && accumulator.argumentsText !== previousArgumentsText) {
    emitDelta({
      argumentsText: accumulator.argumentsText,
      invocationId: accumulator.id,
      toolName: accumulator.name,
      type: 'tool_invocation_delta',
    })
  }
}

function resolveAccumulatorOutputIndex(
  payload: CodexStreamEventPayload,
  item: Record<string, unknown> | null,
  referenceIndex: Map<string, number>,
  nextSyntheticOutputIndex: () => number,
) {
  const directOutputIndex = readCodexToolOutputIndex(payload, item)
  if (directOutputIndex !== null) {
    return directOutputIndex
  }

  const referenceCandidates = [payload.call_id, payload.item_id, item?.call_id, item?.id]
  for (const candidate of referenceCandidates) {
    const reference = readText(candidate)
    if (!reference) {
      continue
    }

    const outputIndex = referenceIndex.get(reference)
    if (typeof outputIndex === 'number') {
      return outputIndex
    }
  }

  return nextSyntheticOutputIndex()
}

function upsertToolAccumulatorFromOutputItem(
  payload: CodexStreamEventPayload,
  toolCallsByOutputIndex: Map<number, CodexToolCallAccumulator>,
  referenceIndex: Map<string, number>,
  nextSyntheticOutputIndex: () => number,
  emitDelta: (event: ToolLifecycleStreamEvent) => void,
) {
  const item = readNestedRecord(payload.item)
  if (!item || item.type !== 'function_call') {
    return false
  }

  const outputIndex = resolveAccumulatorOutputIndex(payload, item, referenceIndex, nextSyntheticOutputIndex)
  const accumulator = toolCallsByOutputIndex.get(outputIndex) ?? {
    argumentsText: '',
    id: readText(item.call_id) ?? readText(payload.call_id) ?? randomUUID(),
    itemId: readText(item.id) ?? readText(payload.item_id),
    name: '',
    outputIndex,
    startedAt: null,
  }
  const previousArgumentsText = accumulator.argumentsText

  const nextToolId = readText(item.call_id) ?? readText(payload.call_id)
  if (nextToolId) {
    accumulator.id = nextToolId
  }

  const nextItemId = readText(item.id) ?? readText(payload.item_id)
  if (nextItemId) {
    accumulator.itemId = nextItemId
  }

  const nextName = readText(item.name)
  if (nextName) {
    accumulator.name = nextName
  }

  const nextArgumentsText = readText(item.arguments) ?? readDeltaText(item.arguments) ?? readText(payload.arguments)
  if (nextArgumentsText !== null) {
    accumulator.argumentsText = nextArgumentsText
  }

  toolCallsByOutputIndex.set(outputIndex, accumulator)
  registerToolAccumulatorReferences(referenceIndex, accumulator)
  emitToolAccumulatorLifecycleEvent(accumulator, previousArgumentsText, emitDelta)
  return true
}

function updateToolAccumulatorArgumentsFromDelta(
  payload: CodexStreamEventPayload,
  toolCallsByOutputIndex: Map<number, CodexToolCallAccumulator>,
  referenceIndex: Map<string, number>,
  nextSyntheticOutputIndex: () => number,
  emitDelta: (event: ToolLifecycleStreamEvent) => void,
) {
  const item = readNestedRecord(payload.item)
  const delta = readDeltaText(payload.delta)
  if (!delta) {
    return
  }

  const outputIndex = resolveAccumulatorOutputIndex(payload, item, referenceIndex, nextSyntheticOutputIndex)
  const accumulator = toolCallsByOutputIndex.get(outputIndex) ?? {
    argumentsText: '',
    id: readText(payload.call_id) ?? readText(item?.call_id) ?? randomUUID(),
    itemId: readText(payload.item_id) ?? readText(item?.id),
    name: readText(item?.name) ?? '',
    outputIndex,
    startedAt: null,
  }
  const previousArgumentsText = accumulator.argumentsText

  accumulator.argumentsText += delta

  const nextToolId = readText(payload.call_id) ?? readText(item?.call_id)
  if (nextToolId) {
    accumulator.id = nextToolId
  }

  const nextItemId = readText(payload.item_id) ?? readText(item?.id)
  if (nextItemId) {
    accumulator.itemId = nextItemId
  }

  const nextName = readText(item?.name)
  if (nextName) {
    accumulator.name = nextName
  }

  toolCallsByOutputIndex.set(outputIndex, accumulator)
  registerToolAccumulatorReferences(referenceIndex, accumulator)
  emitToolAccumulatorLifecycleEvent(accumulator, previousArgumentsText, emitDelta)
}

function finalizeToolAccumulatorArguments(
  payload: CodexStreamEventPayload,
  toolCallsByOutputIndex: Map<number, CodexToolCallAccumulator>,
  referenceIndex: Map<string, number>,
  nextSyntheticOutputIndex: () => number,
  emitDelta: (event: ToolLifecycleStreamEvent) => void,
) {
  const item = readNestedRecord(payload.item)
  const outputIndex = resolveAccumulatorOutputIndex(payload, item, referenceIndex, nextSyntheticOutputIndex)
  const accumulator = toolCallsByOutputIndex.get(outputIndex)
  if (!accumulator) {
    return
  }

  const previousArgumentsText = accumulator.argumentsText
  const nextArgumentsText = readText(payload.arguments) ?? readText(item?.arguments) ?? readDeltaText(item?.arguments)
  if (nextArgumentsText !== null) {
    accumulator.argumentsText = nextArgumentsText
  }

  const nextToolId = readText(payload.call_id) ?? readText(item?.call_id)
  if (nextToolId) {
    accumulator.id = nextToolId
  }

  const nextItemId = readText(payload.item_id) ?? readText(item?.id)
  if (nextItemId) {
    accumulator.itemId = nextItemId
  }

  const nextName = readText(item?.name)
  if (nextName) {
    accumulator.name = nextName
  }

  registerToolAccumulatorReferences(referenceIndex, accumulator)
  emitToolAccumulatorLifecycleEvent(accumulator, previousArgumentsText, emitDelta)
}

function toToolCallList(toolCallsByOutputIndex: Map<number, CodexToolCallAccumulator>) {
  return Array.from(toolCallsByOutputIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, toolCall]) => {
      if (!toolCall.name.trim()) {
        throw new Error('Codex returned a tool call without a name.')
      }

      return {
        argumentsText: toolCall.argumentsText,
        id: toolCall.id,
        name: toolCall.name,
        startedAt: toolCall.startedAt ?? Date.now(),
      } satisfies OpenAICompatibleToolCall
    })
}

function handleStreamEventPayload(
  payload: CodexStreamEventPayload,
  emitDelta: (event: ParsedCodexStreamEvent) => void,
  toolCallsByOutputIndex: Map<number, CodexToolCallAccumulator>,
  referenceIndex: Map<string, number>,
  nextSyntheticOutputIndex: () => number,
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

  if (eventType === 'response.reasoning_summary_text.delta' || eventType === 'response.reasoning_text.delta') {
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

  if (eventType === 'response.output_item.added' || eventType === 'response.output_item.done') {
    const handledToolCall = upsertToolAccumulatorFromOutputItem(
      payload,
      toolCallsByOutputIndex,
      referenceIndex,
      nextSyntheticOutputIndex,
      emitDelta,
    )
    if (handledToolCall) {
      return
    }

    const outputItemReasoningText = extractReasoningTextFromOutputItem(payload)
    if (!outputItemReasoningText) {
      return
    }

    emitDelta({
      delta: outputItemReasoningText,
      isNewReasoningBlock: eventType === 'response.output_item.added',
      sourceEventType: eventType,
      type: 'reasoning_delta',
    })
    return
  }

  if (eventType === 'response.function_call_arguments.delta') {
    updateToolAccumulatorArgumentsFromDelta(
      payload,
      toolCallsByOutputIndex,
      referenceIndex,
      nextSyntheticOutputIndex,
      emitDelta,
    )
    return
  }

  if (eventType === 'response.function_call_arguments.done') {
    finalizeToolAccumulatorArguments(
      payload,
      toolCallsByOutputIndex,
      referenceIndex,
      nextSyntheticOutputIndex,
      emitDelta,
    )
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

export async function parseSseResponseStream(
  response: Response,
  emitDelta: ProviderStreamContext['emitDelta'],
  signal: AbortSignal,
): Promise<CodexStreamTurnResult> {
  if (!response.body) {
    throw new Error('Codex returned an empty streaming response body.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolCallsByOutputIndex = new Map<number, CodexToolCallAccumulator>()
  const referenceIndex = new Map<string, number>()
  let pendingBuffer = ''
  let assistantContent = ''
  let hasReasoningContent = false
  let nextSyntheticOutputIndexValue = 0
  let shouldPrefixNextReasoningSummaryDelta = false

  const blockSeparatorPattern = /\r?\n\r?\n/
  const nextSyntheticOutputIndex = () => {
    const nextValue = nextSyntheticOutputIndexValue
    nextSyntheticOutputIndexValue += 1
    return nextValue
  }

  const emitParsedDelta = (event: ParsedCodexStreamEvent) => {
    if (event.type === 'content_delta') {
      assistantContent += event.delta
      emitDelta(event)
      return
    }

    if (event.type === 'reasoning_delta') {
      const shouldPrefixNewline =
        (Boolean(event.isNewReasoningBlock) ||
          (shouldPrefixNextReasoningSummaryDelta &&
            event.sourceEventType === 'response.reasoning_summary_text.delta')) &&
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
      return
    }

    emitDelta(event)
  }

  const consumePayload = (payload: CodexStreamEventPayload) => {
    const payloadType = typeof payload.type === 'string' ? payload.type : ''
    if (payloadType === 'response.reasoning_summary_text.done') {
      shouldPrefixNextReasoningSummaryDelta = true
    }

    handleStreamEventPayload(
      payload,
      emitParsedDelta,
      toolCallsByOutputIndex,
      referenceIndex,
      nextSyntheticOutputIndex,
    )
  }

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
        return {
          assistantContent,
          toolCalls: toToolCallList(toolCallsByOutputIndex),
        }
      }

      try {
        consumePayload(JSON.parse(dataBlock) as CodexStreamEventPayload)
      } catch {
        // Ignore malformed event payloads and continue consuming the stream.
      }
    }
  }

  if (signal.aborted) {
    return {
      assistantContent,
      toolCalls: toToolCallList(toolCallsByOutputIndex),
    }
  }

  const finalChunk = pendingBuffer + decoder.decode()
  if (finalChunk.trim().length > 0) {
    const finalDataBlock = parseSseEventBlock(finalChunk)
    if (finalDataBlock && finalDataBlock !== '[DONE]') {
      try {
        consumePayload(JSON.parse(finalDataBlock) as CodexStreamEventPayload)
      } catch {
        // Ignore malformed final payloads.
      }
    }
  }

  return {
    assistantContent,
    toolCalls: toToolCallList(toolCallsByOutputIndex),
  }
}

export function buildInMemoryAssistantMessage(content: string): Message {
  return {
    content,
    id: randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Tool execution failed.'
}

export async function executeCodexToolCall(
  toolCall: OpenAICompatibleToolCall,
  context: ProviderStreamContext,
  request: ProviderStreamRequest,
  inMemoryMessages: Message[],
) {
  const startedAt = toolCall.startedAt
  const toolDefinition = getOpenAICompatibleToolDefinition(toolCall.name)

  if (!toolDefinition) {
    const completedAt = Date.now()
    const errorMessage = `Unsupported tool: ${toolCall.name}`
    const failedArtifacts = buildFailedToolArtifacts(toolCall, errorMessage, startedAt, completedAt)

    context.emitDelta({
      argumentsText: failedArtifacts.toolInvocation.argumentsText,
      completedAt,
      errorMessage,
      invocationId: toolCall.id,
      resultContent: failedArtifacts.resultContent,
      syntheticMessage: failedArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_failed',
    })

    inMemoryMessages.push(failedArtifacts.syntheticMessage)
    return
  }

  try {
    const argumentsValue = toolDefinition.parseArguments(toolCall.argumentsText)
    const semanticResult = await toolDefinition.execute(argumentsValue, {
      agentContextRootPath: request.agentContextRootPath,
      signal: context.signal,
    })
    const completedAt = Date.now()
    const successfulArtifacts = buildSuccessfulToolArtifacts(toolCall, semanticResult, startedAt, completedAt)

    context.emitDelta({
      argumentsText: successfulArtifacts.toolInvocation.argumentsText,
      completedAt,
      invocationId: toolCall.id,
      resultContent: successfulArtifacts.resultContent,
      syntheticMessage: successfulArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_completed',
    })

    inMemoryMessages.push(successfulArtifacts.syntheticMessage)
  } catch (error) {
    const completedAt = Date.now()
    const errorMessage = toErrorMessage(error)
    const errorDetails = error instanceof OpenAICompatibleToolError ? error.details : undefined
    const failedArtifacts = buildFailedToolArtifacts(toolCall, errorMessage, startedAt, completedAt, errorDetails)

    context.emitDelta({
      argumentsText: failedArtifacts.toolInvocation.argumentsText,
      completedAt,
      errorMessage,
      invocationId: toolCall.id,
      resultContent: failedArtifacts.resultContent,
      syntheticMessage: failedArtifacts.syntheticMessage,
      toolName: toolCall.name,
      type: 'tool_invocation_failed',
    })

    inMemoryMessages.push(failedArtifacts.syntheticMessage)
  }
}
