import { randomUUID } from 'node:crypto'
import type { AppTerminalExecutionMode, ChatProviderId, Message } from '../../../src/types/chat'

const CONTEXT_SCHEMA = 'echosphere.runtime_context/v1'
const CONTEXT_TAG = 'context_update'

interface RuntimeContextSnapshot {
  agentContextRootPath: string
  providerId: ChatProviderId
  terminalExecutionMode: AppTerminalExecutionMode
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeSnapshot(snapshot: RuntimeContextSnapshot): RuntimeContextSnapshot {
  return {
    agentContextRootPath: snapshot.agentContextRootPath,
    providerId: snapshot.providerId,
    terminalExecutionMode: snapshot.terminalExecutionMode,
  }
}

function snapshotsEqual(left: RuntimeContextSnapshot | null, right: RuntimeContextSnapshot) {
  if (!left) {
    return false
  }

  return (
    left.agentContextRootPath === right.agentContextRootPath &&
    left.providerId === right.providerId &&
    left.terminalExecutionMode === right.terminalExecutionMode
  )
}

function buildRuntimeContextMessageContent(snapshot: RuntimeContextSnapshot) {
  return [
    'Runtime context update. Treat this as authoritative for the current turn.',
    `<${CONTEXT_TAG}>`,
    JSON.stringify(
      {
        ...snapshot,
        schema: CONTEXT_SCHEMA,
      },
      null,
      2,
    ),
    `</${CONTEXT_TAG}>`,
  ].join('\n')
}

function parseRuntimeContextSnapshot(content: string): RuntimeContextSnapshot | null {
  const startTag = `<${CONTEXT_TAG}>`
  const endTag = `</${CONTEXT_TAG}>`
  const startIndex = content.indexOf(startTag)
  const endIndex = content.indexOf(endTag)
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return null
  }

  const rawJson = content.slice(startIndex + startTag.length, endIndex).trim()
  if (!hasText(rawJson)) {
    return null
  }

  let parsedValue: unknown
  try {
    parsedValue = JSON.parse(rawJson)
  } catch {
    return null
  }

  if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
    return null
  }

  const record = parsedValue as Record<string, unknown>
  if (record.schema !== CONTEXT_SCHEMA) {
    return null
  }

  if (!hasText(record.agentContextRootPath) || !hasText(record.providerId) || !hasText(record.terminalExecutionMode)) {
    return null
  }

  return {
    agentContextRootPath: record.agentContextRootPath,
    providerId: record.providerId as ChatProviderId,
    terminalExecutionMode: record.terminalExecutionMode as AppTerminalExecutionMode,
  }
}

export function readLatestRuntimeContextSnapshot(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') {
      continue
    }

    const parsedSnapshot = parseRuntimeContextSnapshot(message.content)
    if (parsedSnapshot) {
      return parsedSnapshot
    }
  }

  return null
}

export function appendRuntimeContextMessageIfChanged(
  messages: Message[],
  snapshot: RuntimeContextSnapshot,
  previousSnapshot: RuntimeContextSnapshot | null,
) {
  const normalizedSnapshot = normalizeSnapshot(snapshot)
  if (snapshotsEqual(previousSnapshot, normalizedSnapshot)) {
    return {
      messages,
      snapshot: previousSnapshot,
    }
  }

  const runtimeContextMessage: Message = {
    content: buildRuntimeContextMessageContent(normalizedSnapshot),
    id: randomUUID(),
    role: 'user',
    timestamp: Date.now(),
    userMessageKind: 'tool_result',
  }

  return {
    messages: [...messages, runtimeContextMessage],
    snapshot: normalizedSnapshot,
  }
}

export type { RuntimeContextSnapshot }
