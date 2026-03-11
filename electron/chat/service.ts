import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { ChatStreamEvent, StartChatStreamInput, StartChatStreamResult } from '../../src/types/chat'
import { streamProviderResponse } from './providerRegistry'

const STREAM_EVENT_CHANNEL = 'chat:stream:event'

interface ActiveStream {
  abortController: AbortController
  ownerWebContentsId: number
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

export function startChatStream(webContents: WebContents, input: StartChatStreamInput): StartChatStreamResult {
  ensureWebContentsCleanup(webContents)

  const streamId = randomUUID()
  const abortController = new AbortController()
  activeStreams.set(streamId, {
    abortController,
    ownerWebContentsId: webContents.id,
  })

  queueMicrotask(() => {
    void (async () => {
      emitStreamEvent(webContents, {
        streamId,
        type: 'started',
      })

      try {
        await streamProviderResponse(
          {
            messages: input.messages,
            modelId: input.modelId,
            providerId: input.providerId,
            reasoningEffort: input.reasoningEffort,
          },
          {
            emitDelta: (deltaEvent) => {
              emitStreamEvent(webContents, {
                ...deltaEvent,
                streamId,
              })
            },
            signal: abortController.signal,
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
        activeStreams.delete(streamId)
      }
    })()
  })

  return {
    streamId,
  }
}

export function cancelChatStream(webContents: WebContents, streamId: string) {
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
  activeStreams.delete(streamId)
}
