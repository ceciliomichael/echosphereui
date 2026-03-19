import { Codex } from '@openai/codex-sdk'
import type { ChatProviderAdapter, ProviderStreamContext, ProviderStreamRequest } from '../providerTypes'
import { createCodexSdkEventAdapter } from './codexSdkEventAdapter'
import { DEFAULT_CODEX_NATIVE_TOOL_POLICY } from './codexNativeTools'
import { buildCodexSdkPrompt } from './codexSdkPrompt'

const codexNativeToolPolicy = DEFAULT_CODEX_NATIVE_TOOL_POLICY

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
    await streamCodexResponseWithNativeTools(request, context)
  },
}
