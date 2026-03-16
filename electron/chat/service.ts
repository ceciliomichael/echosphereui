import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  ChatStreamEvent,
  SubmitToolDecisionInput,
  SubmitToolDecisionResult,
  StartChatStreamInput,
  StartChatStreamResult,
  ToolDecisionKind,
  ToolDecisionOption,
} from '../../src/types/chat'
import { terminateTerminalSessionsForStream } from './openaiCompatible/tools/terminalSessionManager'
import { streamProviderResponse } from './providerRegistry'

const STREAM_EVENT_CHANNEL = 'chat:stream:event'

interface ActiveStream {
  abortController: AbortController
  ownerWebContentsId: number
  settledPromise: Promise<void>
}

interface PendingToolDecisionRequest {
  allowCustomAnswer: boolean
  invocationId: string
  kind: ToolDecisionKind
  options: ToolDecisionOption[]
  ownerWebContentsId: number
  reject: (reason?: unknown) => void
  resolve: (value: {
    answerText: string
    selectedOptionId: string | null
    selectedOptionLabel: string | null
    usedCustomAnswer: boolean
  }) => void
  streamId: string
  toolName: string
}

const activeStreams = new Map<string, ActiveStream>()
const trackedWebContentsIds = new Set<number>()
const pendingToolDecisions = new Map<string, PendingToolDecisionRequest>()

function getPendingToolDecisionKey(streamId: string, invocationId: string) {
  return `${streamId}:${invocationId}`
}

function emitStreamEvent(webContents: WebContents, event: ChatStreamEvent) {
  if (webContents.isDestroyed()) {
    return
  }

  webContents.send(STREAM_EVENT_CHANNEL, event)
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Unable to complete the request.'
}

function ensureWebContentsCleanup(webContents: WebContents) {
  if (trackedWebContentsIds.has(webContents.id)) {
    return
  }

  trackedWebContentsIds.add(webContents.id)
  webContents.once('destroyed', () => {
    for (const [streamId, activeStream] of activeStreams.entries()) {
      if (activeStream.ownerWebContentsId === webContents.id) {
        activeStream.abortController.abort()
        activeStreams.delete(streamId)
      }
    }

    for (const [pendingKey, pendingDecision] of pendingToolDecisions.entries()) {
      if (pendingDecision.ownerWebContentsId !== webContents.id) {
        continue
      }

      pendingDecision.reject(new Error('User input request canceled because the window was closed.'))
      pendingToolDecisions.delete(pendingKey)
    }

    trackedWebContentsIds.delete(webContents.id)
  })
}

function clearPendingToolDecisionsForStream(streamId: string, errorMessage: string) {
  for (const [pendingKey, pendingDecision] of pendingToolDecisions.entries()) {
    if (pendingDecision.streamId !== streamId) {
      continue
    }

    pendingDecision.reject(new Error(errorMessage))
    pendingToolDecisions.delete(pendingKey)
  }
}

async function awaitToolUserDecision(
  webContents: WebContents,
  signal: AbortSignal,
  input: {
    allowCustomAnswer: boolean
    invocationId: string
    kind: ToolDecisionKind
    options: ToolDecisionOption[]
    prompt: string
    streamId: string
    toolName: string
  },
) {
  if (signal.aborted) {
    throw new Error('Tool decision was canceled before user input was submitted.')
  }

  emitStreamEvent(webContents, {
    allowCustomAnswer: input.allowCustomAnswer,
    invocationId: input.invocationId,
    kind: input.kind,
    options: input.options,
    prompt: input.prompt,
    streamId: input.streamId,
    toolName: input.toolName,
    type: 'tool_invocation_decision_requested',
  })

  const pendingKey = getPendingToolDecisionKey(input.streamId, input.invocationId)

  if (pendingToolDecisions.has(pendingKey)) {
    throw new Error(`A pending tool decision already exists for ${input.toolName}:${input.invocationId}.`)
  }

  return new Promise<{
    answerText: string
    selectedOptionId: string | null
    selectedOptionLabel: string | null
    usedCustomAnswer: boolean
  }>((resolve, reject) => {
    const abortHandler = () => {
      pendingToolDecisions.delete(pendingKey)
      reject(new Error('Tool decision was canceled because the stream was aborted.'))
    }

    signal.addEventListener('abort', abortHandler, { once: true })

    pendingToolDecisions.set(pendingKey, {
      allowCustomAnswer: input.allowCustomAnswer,
      invocationId: input.invocationId,
      kind: input.kind,
      options: input.options,
      ownerWebContentsId: webContents.id,
      reject: (reason) => {
        signal.removeEventListener('abort', abortHandler)
        reject(reason)
      },
      resolve: (value) => {
        signal.removeEventListener('abort', abortHandler)
        resolve(value)
      },
      streamId: input.streamId,
      toolName: input.toolName,
    })
  })
}

function getLatestHumanUserCheckpointId(input: StartChatStreamInput) {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]
    if (message.role !== 'user' || message.userMessageKind === 'tool_result') {
      continue
    }

    return message.runCheckpoint?.id ?? null
  }

  return null
}

export function startChatStream(webContents: WebContents, input: StartChatStreamInput): StartChatStreamResult {
  ensureWebContentsCleanup(webContents)

  const streamId = randomUUID()
  const abortController = new AbortController()
  const workspaceCheckpointId = getLatestHumanUserCheckpointId(input)
  let resolveSettledPromise: () => void = () => {}
  const settledPromise = new Promise<void>((resolve) => {
    resolveSettledPromise = resolve
  })
  activeStreams.set(streamId, {
    abortController,
    ownerWebContentsId: webContents.id,
    settledPromise,
  })

  setTimeout(() => {
    void (async () => {
      emitStreamEvent(webContents, {
        streamId,
        type: 'started',
      })

      try {
        await streamProviderResponse(
          {
            agentContextRootPath: input.agentContextRootPath,
            chatMode: input.chatMode,
            messages: input.messages,
            modelId: input.modelId,
            providerId: input.providerId,
            reasoningEffort: input.reasoningEffort,
            terminalExecutionMode: input.terminalExecutionMode,
          },
          {
            emitDelta: (deltaEvent) => {
              emitStreamEvent(webContents, {
                ...deltaEvent,
                streamId,
              })
            },
            awaitUserDecision: (decisionInput) =>
              awaitToolUserDecision(webContents, abortController.signal, {
                ...decisionInput,
                streamId,
              }),
            signal: abortController.signal,
            streamId,
            terminalExecutionMode: input.terminalExecutionMode,
            workspaceCheckpointId,
          },
        )

        if (!abortController.signal.aborted) {
          emitStreamEvent(webContents, {
            streamId,
            type: 'completed',
          })
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        emitStreamEvent(webContents, {
          errorMessage: toErrorMessage(error),
          streamId,
          type: 'error',
        })
      } finally {
        clearPendingToolDecisionsForStream(streamId, 'Tool decision canceled because the stream ended.')
        await terminateTerminalSessionsForStream(streamId)
        activeStreams.delete(streamId)
        resolveSettledPromise()
      }
    })()
  }, 0)

  return {
    streamId,
  }
}

export async function cancelChatStream(webContents: WebContents, streamId: string) {
  const activeStream = activeStreams.get(streamId)
  if (!activeStream) {
    return
  }

  if (activeStream.ownerWebContentsId !== webContents.id) {
    return
  }

  emitStreamEvent(webContents, {
    streamId,
    type: 'aborted',
  })
  activeStream.abortController.abort()
  clearPendingToolDecisionsForStream(streamId, 'Tool decision canceled by user request.')
  await activeStream.settledPromise
}

export async function submitToolDecision(
  webContents: WebContents,
  input: SubmitToolDecisionInput,
): Promise<SubmitToolDecisionResult> {
  const pendingKey = getPendingToolDecisionKey(input.streamId, input.invocationId)
  const pendingDecision = pendingToolDecisions.get(pendingKey)
  if (!pendingDecision) {
    throw new Error('No pending tool decision request was found for this invocation.')
  }

  if (pendingDecision.ownerWebContentsId !== webContents.id) {
    throw new Error('Only the originating window can submit this tool decision.')
  }

  const selectedOptionId = input.selectedOptionId?.trim() ?? ''
  const customAnswer = input.customAnswer?.trim() ?? ''
  const selectedOption =
    selectedOptionId.length > 0
      ? pendingDecision.options.find((option) => option.id === selectedOptionId) ?? null
      : null

  if (!selectedOption && customAnswer.length === 0) {
    throw new Error('A valid option or custom answer is required.')
  }

  if (!selectedOption && !pendingDecision.allowCustomAnswer) {
    throw new Error('This tool request does not allow custom answers.')
  }

  pendingToolDecisions.delete(pendingKey)
  pendingDecision.resolve({
    answerText: selectedOption?.label ?? customAnswer,
    selectedOptionId: selectedOption?.id ?? null,
    selectedOptionLabel: selectedOption?.label ?? null,
    usedCustomAnswer: selectedOption === null,
  })

  return {
    accepted: true,
  }
}
