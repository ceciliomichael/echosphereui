import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  EstimateContextUsageInput,
  ContextUsageEstimate,
  StartChatStreamInput,
  StartChatStreamResult,
  SubmitToolDecisionInput,
  SubmitToolDecisionResult,
} from '../../../src/types/chat'
import { estimateToolEnabledContextUsage, runToolEnabledChatStream } from '../shared/runtime'
import { createOpenAICompatibleClient } from './client'
import { readOpenAICompatibleProviderConfig } from './config'

const activeStreams = new Map<string, AbortController>()

export async function estimateOpenAICompatibleContextUsage(
  input: EstimateContextUsageInput,
): Promise<ContextUsageEstimate> {
  return estimateToolEnabledContextUsage({
    agentContextRootPath: input.agentContextRootPath,
    chatMode: input.chatMode,
    messages: input.messages,
  })
}

export async function startOpenAICompatibleChatStream(
  webContents: WebContents,
  input: StartChatStreamInput,
  onSettled?: () => void,
): Promise<StartChatStreamResult> {
  if (input.providerId !== 'openai-compatible') {
    throw new Error('Only the OpenAI-compatible provider is available in the rebuilt chat backend.')
  }

  const modelId = input.modelId.trim()
  if (!modelId) {
    throw new Error('Select a model before starting a chat.')
  }

  const streamId = randomUUID()
  const abortController = new AbortController()
  activeStreams.set(streamId, abortController)

  queueMicrotask(() => {
    void runOpenAICompatibleChatStream(webContents, streamId, input, abortController, onSettled)
  })

  return { streamId }
}

async function runOpenAICompatibleChatStream(
  webContents: WebContents,
  streamId: string,
  input: StartChatStreamInput,
  abortController: AbortController,
  onSettled?: () => void,
) {
  try {
    const providerConfig = await readOpenAICompatibleProviderConfig()
    const client = createOpenAICompatibleClient(providerConfig)
    await runToolEnabledChatStream({
      abortController,
      createStream: (streamInput) =>
        client.chat.completions.create({
          messages: streamInput.messages,
          model: streamInput.model,
          reasoningEffort: streamInput.reasoningEffort,
          signal: streamInput.signal,
          stopWhen: streamInput.stopWhen,
          system: streamInput.system,
          tools: streamInput.tools,
        }),
      onSettled,
      promptOptions: {
        includeAssistantReasoningParts: false,
      },
      startInput: input,
      streamId,
      webContents,
    })
  } catch (error) {
    if (!abortController.signal.aborted) {
      throw error
    }
  } finally {
    activeStreams.delete(streamId)
  }
}

export async function cancelOpenAICompatibleChatStream(streamId: string) {
  const abortController = activeStreams.get(streamId)
  if (!abortController) {
    return
  }

  abortController.abort()
}

export async function submitOpenAICompatibleToolDecision(
  input: SubmitToolDecisionInput,
): Promise<SubmitToolDecisionResult> {
  void input
  throw new Error('Tool decisions are not implemented for the rebuilt OpenAI-compatible backend yet.')
}
