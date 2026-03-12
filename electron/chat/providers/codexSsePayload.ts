import type { StreamDeltaEvent } from '../providerTypes'

export interface CodexStreamEventPayload {
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

interface ParsedReasoningEvent {
  delta: string
  isNewReasoningBlock?: boolean
  sourceEventType?: string
  type: 'reasoning_delta'
}

type ContentStreamEvent = Extract<StreamDeltaEvent, { type: 'content_delta' }>

export type ToolLifecycleStreamEvent = Extract<
  StreamDeltaEvent,
  | { type: 'tool_invocation_started' }
  | { type: 'tool_invocation_delta' }
>

export type ParsedCodexStreamEvent = ContentStreamEvent | ParsedReasoningEvent | ToolLifecycleStreamEvent

export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function readText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export function readDeltaText(input: unknown): string | null {
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

export function readNestedRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

export function extractReasoningTextFromOutputItem(payload: CodexStreamEventPayload): string | null {
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

export function extractReasoningTextFromContentPart(payload: CodexStreamEventPayload): string | null {
  const part = readNestedRecord(payload.part)
  const partType = part?.type
  if (typeof partType !== 'string' || (!partType.includes('reasoning') && !partType.includes('summary'))) {
    return null
  }

  return readDeltaText(payload.delta) ?? readDeltaText(part?.text) ?? readDeltaText(part?.delta)
}
