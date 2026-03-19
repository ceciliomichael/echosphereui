import { randomUUID } from 'node:crypto'
import { Codex } from '@openai/codex-sdk'
import type { ChatProviderAdapter, ProviderStreamContext, ProviderStreamRequest } from '../providerTypes'
import { streamAgentLoopWithTools } from '../agentLoop/runtime'
import { forceRefreshCodexAuthData, loadCodexAuthData } from './codexAuth'
import { createCodexSdkEventAdapter } from './codexSdkEventAdapter'
import { DEFAULT_CODEX_NATIVE_TOOL_POLICY } from './codexNativeTools'
import { buildCodexSdkPrompt } from './codexSdkPrompt'
import {
  buildCodexPayload,
  parseSseResponseStream,
  type CodexRequestPayload,
} from './codexRuntime'

const codexNativeToolPolicy = DEFAULT_CODEX_NATIVE_TOOL_POLICY
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_VERSION_HEADER = '0.101.0'
const CODEX_USER_AGENT = 'codex_cli_rs/0.101.0 (Windows; x86_64)'
const CODEX_ORIGINATOR = 'codex_cli_rs'

function toCodexSandboxMode(terminalExecutionMode: ProviderStreamRequest['terminalExecutionMode']) {
  if (terminalExecutionMode === 'full') {
    return 'danger-full-access'
  }

  return 'workspace-write'
}

function buildCodexConfigOverrides() {
  return {
    features: {
      shell_tool: codexNativeToolPolicy.allowCommandExecution,
    },
  } as const
}

function buildCodexWebSearchMode() {
  return codexNativeToolPolicy.allowWebSearch ? 'live' : 'disabled'
}

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

async function streamCodexResponseWithEchosphereTools(request: ProviderStreamRequest, context: ProviderStreamContext) {
  return streamAgentLoopWithTools(
    {
      agentContextRootPath: request.agentContextRootPath,
      chatMode: request.chatMode,
      haltOnPlanToAgentSwitch: true,
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
      const response = await sendCodexStreamingRequest(payload, turnContext.signal)
      return parseSseResponseStream(response, turnContext.emitDelta, turnContext.signal, {
        onToolCallReady: options?.onToolCallReady,
      })
    },
  )
}

async function streamCodexResponseWithNativeTools(request: ProviderStreamRequest, context: ProviderStreamContext) {
  const codex = new Codex({
    config: buildCodexConfigOverrides(),
  })
  const thread = codex.startThread({
    approvalPolicy: 'never',
    model: request.modelId,
    modelReasoningEffort: request.reasoningEffort,
    sandboxMode: toCodexSandboxMode(request.terminalExecutionMode),
    skipGitRepoCheck: true,
    webSearchMode: buildCodexWebSearchMode(),
    workingDirectory: request.agentContextRootPath,
  })
  const prompt = await buildCodexSdkPrompt(request, codexNativeToolPolicy)
  const eventAdapter = createCodexSdkEventAdapter(context.emitDelta, codexNativeToolPolicy)
  const streamedTurn = await thread.runStreamed(prompt, {
    signal: context.signal,
  })

  for await (const event of streamedTurn.events) {
    eventAdapter.consumeEvent(event)
  }
}

export const codexChatProviderAdapter: ChatProviderAdapter = {
  providerId: 'codex',
  async streamResponse(request, context) {
    if (request.chatMode === 'plan') {
      const loopResult = await streamCodexResponseWithEchosphereTools(request, context)
      if (loopResult.transitionedPlanToAgent && !context.signal.aborted) {
        await streamCodexResponseWithNativeTools(
          {
            ...request,
            chatMode: 'agent',
            messages: loopResult.messages,
          },
          context,
        )
      }
      return
    }

    await streamCodexResponseWithNativeTools(request, context)
  },
}
