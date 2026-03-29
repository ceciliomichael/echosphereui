import { randomUUID } from 'node:crypto'
import { streamAgentLoopWithTools } from '../agentLoop/runtime'
import type { ProviderStreamContext, ProviderStreamRequest } from '../providerTypes'
import { forceRefreshCodexAuthData, loadCodexAuthData } from './codexAuth'
import { buildCodexPayload, type CodexRequestPayload } from './codexPayload'
import { parseSseResponseStream } from './codexSseParser'

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_VERSION_HEADER = '0.101.0'
const CODEX_USER_AGENT = 'codex_cli_rs/0.101.0 (Windows; x86_64)'
const CODEX_ORIGINATOR = 'codex_cli_rs'

function buildCodexHeaders(accessToken: string, accountId: string, sessionId: string) {
  return {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${accessToken}`,
    'Chatgpt-Account-Id': accountId,
    'Content-Type': 'application/json',
    Originator: CODEX_ORIGINATOR,
    Session_id: sessionId,
    'User-Agent': CODEX_USER_AGENT,
    Version: CODEX_VERSION_HEADER,
  }
}

async function sendCodexStreamingRequest(
  payload: CodexRequestPayload,
  signal: AbortSignal,
  sessionId: string,
  forceRefresh = false,
) {
  const authData = forceRefresh ? await forceRefreshCodexAuthData() : await loadCodexAuthData()
  const response = await fetch(CODEX_RESPONSES_URL, {
    body: JSON.stringify(payload),
    headers: buildCodexHeaders(authData.tokens.access_token, authData.tokens.account_id, sessionId),
    method: 'POST',
    signal,
  })

  if (response.status === 401 && !forceRefresh) {
    return sendCodexStreamingRequest(payload, signal, sessionId, true)
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Codex request failed (${response.status}): ${errorText}`)
  }

  return response
}

export async function streamCodexResponsesWithTools(request: ProviderStreamRequest, context: ProviderStreamContext) {
  const codexSessionId = context.streamId.trim().length > 0 ? context.streamId : randomUUID()

  return streamAgentLoopWithTools(
    {
      agentContextRootPath: request.agentContextRootPath,
      chatMode: request.chatMode,
      haltOnPlanToAgentSwitch: false,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      reasoningEffort: request.reasoningEffort,
      terminalExecutionMode: request.terminalExecutionMode,
    },
    context,
    async (turnRequest, turnContext, options) => {
      const payload = await buildCodexPayload(
        {
          ...request,
          agentContextRootPath: turnRequest.agentContextRootPath,
          chatMode: turnRequest.chatMode,
          messages: turnRequest.messages,
          modelId: turnRequest.modelId,
          reasoningEffort: turnRequest.reasoningEffort,
        },
        turnRequest.messages,
      )
      const response = await sendCodexStreamingRequest(payload, turnContext.signal, codexSessionId)
      return parseSseResponseStream(response, turnContext.emitDelta, turnContext.signal, {
        onToolCallReady: options?.onToolCallReady,
      })
    },
  )
}
