import { randomUUID } from 'node:crypto'
import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk'
import { formatStructuredToolResultContent } from '../../../src/lib/toolResultContent'
import type { Message } from '../../../src/types/chat'
import type { ProviderStreamContext, StreamDeltaEvent } from '../providerTypes'
import { buildSuccessfulToolArtifacts } from '../openaiCompatible/toolResultFormatter'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
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

interface NativePlanStep {
  id: string
  status: 'completed' | 'in_progress' | 'pending'
  title: string
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

function toPlanStepId(text: string, index: number) {
  const normalizedValue = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalizedValue.length > 0 ? normalizedValue : `step-${index + 1}`
}

function buildNativePlanSteps(item: Extract<ThreadItem, { type: 'todo_list' }>): NativePlanStep[] {
  const firstIncompleteIndex = item.items.findIndex((step) => !step.completed)

  return item.items.map((step, index) => {
    const normalizedTitle = step.text.trim()
    const stepTitle = normalizedTitle.length > 0 ? normalizedTitle : `Step ${index + 1}`

    if (step.completed) {
      return {
        id: toPlanStepId(stepTitle, index),
        status: 'completed',
        title: stepTitle,
      }
    }

    return {
      id: toPlanStepId(stepTitle, index),
      status: index === firstIncompleteIndex ? 'in_progress' : 'pending',
      title: stepTitle,
    }
  })
}

function buildPlanArgumentsText(steps: NativePlanStep[]) {
  return JSON.stringify(
    {
      plan: 'codex_native_plan',
      steps,
    },
    null,
    2,
  )
}

function buildPlanSemanticResult(steps: NativePlanStep[]) {
  const completedStepCount = steps.filter((step) => step.status === 'completed').length
  const inProgressSteps = steps.filter((step) => step.status === 'in_progress')
  const pendingStepCount = steps.filter((step) => step.status === 'pending').length
  const allStepsCompleted = steps.every((step) => step.status === 'completed')

  return {
    allStepsCompleted,
    completedStepCount,
    hasIncompleteSteps: !allStepsCompleted,
    inProgressStepCount: inProgressSteps.length,
    inProgressStepId: inProgressSteps[0]?.id ?? null,
    inProgressStepIds: inProgressSteps.map((step) => step.id),
    message: `Plan codex_native_plan updated: ${completedStepCount}/${steps.length} completed.`,
    operation: 'update_plan',
    path: '.',
    pendingStepCount,
    planId: 'codex_native_plan',
    steps: steps.map((step) => ({ ...step })),
    targetKind: 'plan',
    totalStepCount: steps.length,
  }
}

export function createCodexSdkEventAdapter(
  emitDelta: ProviderStreamContext['emitDelta'],
  nativeToolPolicy: CodexNativeToolPolicy,
) {
  const previousTextByItemId = new Map<string, string>()
  const startedToolInvocations = new Map<string, StartedToolInvocation>()
  const completedToolInvocations = new Set<string>()

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

  function consumeNativePlanItem(
    eventType: Extract<ThreadEvent, { type: 'item.started' | 'item.updated' | 'item.completed' }>['type'],
    item: Extract<ThreadItem, { type: 'todo_list' }>,
  ) {
    const steps = buildNativePlanSteps(item)
    const argumentsText = buildPlanArgumentsText(steps)
    const existingInvocation = startedToolInvocations.get(item.id)
    const invocation =
      existingInvocation ??
      (() => {
        const createdInvocation: StartedToolInvocation = {
          argumentsText,
          id: item.id,
          startedAt: Date.now(),
          toolName: 'update_plan',
        }
        startedToolInvocations.set(item.id, createdInvocation)
        emitToolStarted(emitDelta, createdInvocation)
        return createdInvocation
      })()

    if (invocation.argumentsText !== argumentsText) {
      invocation.argumentsText = argumentsText
      emitDelta({
        argumentsText,
        invocationId: invocation.id,
        toolName: invocation.toolName,
        type: 'tool_invocation_delta',
      } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_delta' }>)
    }

    if (eventType !== 'item.completed' || completedToolInvocations.has(item.id)) {
      return
    }

    const semanticResult = buildPlanSemanticResult(steps)
    const completedAt = Date.now()
    const toolCall: OpenAICompatibleToolCall = {
      argumentsText: invocation.argumentsText,
      id: invocation.id,
      name: 'update_plan',
      startedAt: invocation.startedAt,
    }
    const successfulArtifacts = buildSuccessfulToolArtifacts(
      toolCall,
      semanticResult,
      invocation.startedAt,
      completedAt,
    )

    completedToolInvocations.add(item.id)
    emitDelta({
      argumentsText: successfulArtifacts.toolInvocation.argumentsText,
      completedAt,
      invocationId: invocation.id,
      resultContent: successfulArtifacts.resultContent,
      resultPresentation: successfulArtifacts.resultPresentation,
      syntheticMessage: successfulArtifacts.syntheticMessage,
      toolName: 'update_plan',
      type: 'tool_invocation_completed',
    } satisfies Extract<StreamDeltaEvent, { type: 'tool_invocation_completed' }>)
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
      if (item.type === 'todo_list') {
        consumeNativePlanItem(event.type, item)
        return
      }

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
