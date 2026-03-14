import { randomUUID } from 'node:crypto'
import type { ChatProviderAdapter, ProviderStreamContext, ProviderStreamRequest } from '../providerTypes'
import {
  buildCodexPayload,
  buildInMemoryAssistantMessage,
  parseSseResponseStream,
  type CodexRequestPayload,
} from './codexRuntime'
import { buildReplayableMessageHistory } from '../openaiCompatible/messageHistory'
import {
  createHydratedToolExecutionTurnState,
  createToolExecutionScheduler,
} from '../openaiCompatible/toolExecution'
import { forceRefreshCodexAuthData, loadCodexAuthData } from './codexAuth'

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_VERSION_HEADER = '0.101.0'
const CODEX_USER_AGENT = 'codex_cli_rs/0.101.0 (Windows; x86_64)'
const CODEX_ORIGINATOR = 'codex_cli_rs'

function buildCodexHeaders(accessToken: string, accountId: string) {
  return {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${accessToken}`,
    'Chatgpt-Account-Id': accountId,
    'Content-Type': 'application/json',
    Originator: CODEX_ORIGINATOR,
    Session_id: randomUUID(),
    'User-Agent': CODEX_USER_AGENT,
    Version: CODEX_VERSION_HEADER,
  }
}

async function sendCodexStreamingRequest(
  payload: CodexRequestPayload,
  signal: AbortSignal,
  forceRefresh = false,
) {
  const authData = forceRefresh ? await forceRefreshCodexAuthData() : await loadCodexAuthData()
  const response = await fetch(CODEX_RESPONSES_URL, {
    method: 'POST',
    headers: buildCodexHeaders(authData.tokens.access_token, authData.tokens.account_id),
    body: JSON.stringify(payload),
    signal,
  })

  if (response.status === 401 && !forceRefresh) {
    return sendCodexStreamingRequest(payload, signal, true)
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Codex request failed (${response.status}): ${errorText}`)
  }

  return response
}

async function streamCodexResponseWithTools(
  request: ProviderStreamRequest,
  context: ProviderStreamContext,
) {
  const inMemoryMessages = buildReplayableMessageHistory(request.messages)
  const turnState = createHydratedToolExecutionTurnState(request.messages, request.agentContextRootPath)
  const toolExecutionScheduler = createToolExecutionScheduler({
    agentContextRootPath: request.agentContextRootPath,
    context,
    inMemoryMessages,
    turnState,
  })

  while (!context.signal.aborted) {
    const payload = await buildCodexPayload(request, inMemoryMessages)
    const response = await sendCodexStreamingRequest(payload, context.signal)
    const scheduledToolCallIds = new Set<string>()
    const turnResult = await parseSseResponseStream(response, context.emitDelta, context.signal, {
      onToolCallReady(toolCall) {
        scheduledToolCallIds.add(toolCall.id)
        toolExecutionScheduler.schedule(toolCall)
      },
    })

    if (turnResult.toolCalls.length === 0) {
      return
    }

    if (turnResult.assistantContent.trim().length > 0) {
      inMemoryMessages.push(buildInMemoryAssistantMessage(turnResult.assistantContent))
    }

    for (const toolCall of turnResult.toolCalls) {
      if (scheduledToolCallIds.has(toolCall.id)) {
        continue
      }

      toolExecutionScheduler.schedule(toolCall)
    }

    await toolExecutionScheduler.drain()

    if (context.signal.aborted) {
      return
    }
  }
}

export const codexChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'codex',
  async streamResponse(request, context) {
    await streamCodexResponseWithTools(request, context)
  },
}
