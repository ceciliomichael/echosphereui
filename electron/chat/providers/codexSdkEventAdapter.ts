import { randomUUID } from 'node:crypto'
import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk'
import { formatStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import type { Message } from '../../../src/types/chat'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import {
  isCodexNativeToolAllowed,
  type CodexNativeToolKind,
  type CodexNativeToolPolicy,
} from './codexNativeTools'

interface StartedToolInvocation {
  argumentsText: string
  id: string
  startedAt: number
  toolName: string
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function appendDeltaFromPreviousText(
  previousValue: string | undefined,
  nextValue: string,
  emitDelta: (delta: string) => void,
) {
  if (!hasText(nextValue)) {
    return
  }

  if (!previousValue || previousValue.length === 0) {
    emitDelta(nextValue)
    return
  }

  if (nextValue.startsWith(previousValue)) {
    const delta = nextValue.slice(previousValue.length)
    if (delta.length > 0) {
      emitDelta(delta)
    }
    return
  }

  emitDelta(nextValue)
}

function toNativeToolInfo(item: ThreadItem): {
  argumentsText: string
  body: string
  kind: CodexNativeToolKind
  status: 'completed' | 'failed' | 'in_progress'
  toolName: string
} | null {
  if (item.type === 'command_execution') {
    const exitCodeLine =
      typeof item.exit_code === 'number' ? `\n\nExit code: ${item.exit_code}` : '\n\nExit code: unavailable'
    const outputBody = hasText(item.aggregated_output) ? item.aggregated_output : '(no output)'

    return {
      argumentsText: JSON.stringify({ command: item.command }, null, 2),
      body: `${outputBody}${exitCodeLine}`,
      kind: 'command_execution',
      status: item.status,
      toolName: 'exec_command',
    }
  }

  if (item.type === 'file_change') {
    const lines = item.changes.map((change) => `- [${change.kind}] ${change.path}`)

    return {
      argumentsText: JSON.stringify(
        {
          changes: item.changes,
        },
        null,
        2,
      ),
      body: lines.length > 0 ? lines.join('\n') : '(no file updates reported)',
      kind: 'file_change',
      status: item.status,
      toolName: 'file_change',
    }
  }

  if (item.type === 'mcp_tool_call') {
    const resultBody = item.result
      ? JSON.stringify(
          {
            content: item.result.content,
            structured_content: item.result.structured_content,
          },
          null,
          2,
        )
      : '(no MCP result payload)'

    const errorLine = item.error?.message ? `\n\nError: ${item.error.message}` : ''

    return {
      argumentsText: JSON.stringify(
        {
          arguments: item.arguments,
          server: item.server,
          tool: item.tool,
        },
        null,
        2,
      ),
      body: `${resultBody}${errorLine}`,
      kind: 'mcp_tool_call',
      status: item.status,
      toolName: 'mcp_tool_call',
    }
  }

  if (item.type === 'web_search') {
    return {
      argumentsText: JSON.stringify(
        {
          query: item.query,
        },
        null,
        2,
      ),
      body: `Executed web search query: ${item.query}`,
      kind: 'web_search',
      status: 'completed',
      toolName: 'web_search',
    }
  }

  return null
}

function buildNativeToolResultContent(
  invocation: StartedToolInvocation,
  status: 'error' | 'success',
  summary: string,
  body: string,
) {
  return formatStructuredToolResultContent(
    {
      arguments: hasText(invocation.argumentsText)
        ? {
            raw: invocation.argumentsText,
          }
        : undefined,
      schema: 'echosphere.tool_result/v1',
      status,
      summary,
      toolCallId: invocation.id,
      toolName: invocation.toolName,
    },
    body,
  )
}

function buildSyntheticToolMessage(invocationId: string, resultContent: string, timestamp: number): Message {
  return {
    content: resultContent,
    id: randomUUID(),
    role: 'tool',
    timestamp,
    toolCallId: invocationId,
  }
}

function emitToolStarted(
  emitDelta: ProviderStreamContext['emitDelta'],
  invocation: StartedToolInvocation,
) {
  emitDelta({
    argumentsText: invocation.argumentsText,
    invocationId: invocation.id,
    startedAt: invocation.startedAt,
    toolName: invocation.toolName,
    type: 'tool_invocation_started',
  } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_started' }>)
}

function emitToolCompleted(
  emitDelta: ProviderStreamContext['emitDelta'],
  invocation: StartedToolInvocation,
  resultContent: string,
  completedAt: number,
) {
  emitDelta({
    argumentsText: invocation.argumentsText,
    completedAt,
    invocationId: invocation.id,
    resultContent,
    syntheticMessage: buildSyntheticToolMessage(invocation.id, resultContent, completedAt),
    toolName: invocation.toolName,
    type: 'tool_invocation_completed',
  } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_completed' }>)
}

function emitToolFailed(
  emitDelta: ProviderStreamContext['emitDelta'],
  invocation: StartedToolInvocation,
  resultContent: string,
  completedAt: number,
  errorMessage: string,
) {
  emitDelta({
    argumentsText: invocation.argumentsText,
    completedAt,
    errorMessage,
    invocationId: invocation.id,
    resultContent,
    syntheticMessage: buildSyntheticToolMessage(invocation.id, resultContent, completedAt),
    toolName: invocation.toolName,
    type: 'tool_invocation_failed',
  } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_failed' }>)
}

export function createCodexSdkEventAdapter(
  emitDelta: ProviderStreamContext['emitDelta'],
  nativeToolPolicy: CodexNativeToolPolicy,
) {
  const previousTextByItemId = new Map<string, string>()
  const startedToolInvocations = new Map<string, StartedToolInvocation>()

  function getOrCreateStartedToolInvocation(item: ThreadItem, argumentsText: string, toolName: string) {
    const existing = startedToolInvocations.get(item.id)
    if (existing) {
      return existing
    }

    const created: StartedToolInvocation = {
      argumentsText,
      id: item.id,
      startedAt: Date.now(),
      toolName,
    }
    startedToolInvocations.set(item.id, created)
    emitToolStarted(emitDelta, created)
    return created
  }

  function consumeNativeToolItem(item: ThreadItem) {
    const nativeToolInfo = toNativeToolInfo(item)
    if (!nativeToolInfo) {
      return
    }

    const invocation = getOrCreateStartedToolInvocation(item, nativeToolInfo.argumentsText, nativeToolInfo.toolName)
    const completedAt = Date.now()
    const isAllowed = isCodexNativeToolAllowed(nativeToolInfo.kind, nativeToolPolicy)
    if (!isAllowed) {
      const errorMessage = `Native tool "${nativeToolInfo.kind}" is disabled by local policy.`
      const resultContent = buildNativeToolResultContent(invocation, 'error', errorMessage, nativeToolInfo.body)
      emitToolFailed(emitDelta, invocation, resultContent, completedAt, errorMessage)
      return
    }

    if (nativeToolInfo.status === 'in_progress') {
      return
    }

    if (nativeToolInfo.status === 'failed') {
      const errorMessage = `${invocation.toolName} failed.`
      const resultContent = buildNativeToolResultContent(invocation, 'error', errorMessage, nativeToolInfo.body)
      emitToolFailed(emitDelta, invocation, resultContent, completedAt, errorMessage)
      return
    }

    const resultContent = buildNativeToolResultContent(
      invocation,
      'success',
      `${invocation.toolName} completed successfully.`,
      nativeToolInfo.body,
    )
    emitToolCompleted(emitDelta, invocation, resultContent, completedAt)
  }

  return {
    consumeEvent(event: ThreadEvent) {
      if (event.type === 'error') {
        throw new Error(event.message)
      }

      if (event.type === 'turn.failed') {
        throw new Error(event.error.message)
      }

      if (
        event.type !== 'item.started' &&
        event.type !== 'item.updated' &&
        event.type !== 'item.completed'
      ) {
        return
      }

      const item = event.item
      if (item.type === 'agent_message') {
        appendDeltaFromPreviousText(previousTextByItemId.get(item.id), item.text, (delta) => {
          emitDelta({
            delta,
            type: 'content_delta',
          })
        })
        previousTextByItemId.set(item.id, item.text)
        return
      }

      if (item.type === 'reasoning') {
        appendDeltaFromPreviousText(previousTextByItemId.get(item.id), item.text, (delta) => {
          emitDelta({
            delta,
            type: 'reasoning_delta',
          })
        })
        previousTextByItemId.set(item.id, item.text)
        return
      }

      consumeNativeToolItem(item)
    },
  }
}
