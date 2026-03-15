import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { ChatStreamEvent, StartChatStreamInput, StartChatStreamResult } from '../../src/types/chat'
import { terminateTerminalSessionsForStream } from './openaiCompatible/tools/terminalSessionManager'
import { streamProviderResponse } from './providerRegistry'

const STREAM_EVENT_CHANNEL = 'chat:stream:event'

interface ActiveStream {
  abortController: AbortController
  ownerWebContentsId: number
  settledPromise: Promise<void>
}

const activeStreams = new Map<string, ActiveStream>()
const trackedWebContentsIds = new Set<number>()

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

    trackedWebContentsIds.delete(webContents.id)
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
  await activeStream.settledPromise
}
