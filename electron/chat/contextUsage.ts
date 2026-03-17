import type { ChatProviderId, ContextUsageEstimate, EstimateContextUsageInput, Message } from '../../src/types/chat'
import { buildSystemPrompt } from './prompts'
import { buildAgentPrompt } from './prompts/agent/prompt'
import { buildReplayableMessageHistory } from './openaiCompatible/messageHistory'
import { getCodexToolDefinitions } from './providers/codexPayload'
import { getUserMessageTextBlocks } from './providers/messageAttachments'
import { PROVIDER_SYSTEM_INSTRUCTIONS } from './providers/providerSystemInstructions'
import { getOpenAICompatibleToolDefinitions } from './openaiCompatible/toolRegistry'

const CHARS_PER_TOKEN = 4
const CONTEXT_USAGE_MAX_TOKENS = 200_000
const PENDING_AGENT_CONTEXT_ROOT = '[pending-agent-context-root]'

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function estimateTokensFromText(text: string) {
  return text.length === 0 ? 0 : Math.ceil(text.length / CHARS_PER_TOKEN)
}

function estimateTokensFromSegments(segments: readonly string[]) {
  return estimateTokensFromText(segments.join('\n\n'))
}

function serializeMessageForEstimate(message: Message) {
  if (message.role === 'assistant') {
    return message.content.trim()
  }

  if (message.role !== 'user') {
    return ''
  }

  return getUserMessageTextBlocks(message)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .join('\n\n')
}

function getProviderHistorySegments(messages: Message[], providerId: ChatProviderId) {
  if (providerId === 'codex' || providerId === 'openai-compatible' || providerId === 'mistral') {
    const replayableMessages = buildReplayableMessageHistory(messages)
    const historySegments: string[] = []
    const toolResultSegments: string[] = []

    for (const message of replayableMessages) {
      const serializedMessage = serializeMessageForEstimate(message)
      if (serializedMessage.length === 0) {
        continue
      }

      if (message.userMessageKind === 'tool_result') {
        toolResultSegments.push(serializedMessage)
        continue
      }

      historySegments.push(serializedMessage)
    }

    return {
      historySegments,
      toolResultSegments,
    }
  }

  return {
    historySegments: messages
      .filter((message) => message.role !== 'tool')
      .map((message) => serializeMessageForEstimate(message))
      .filter((segment) => segment.length > 0),
    toolResultSegments: [],
  }
}

async function getSystemPromptSegments(input: EstimateContextUsageInput) {
  if (input.providerId === 'codex') {
    const agentContextRootPath = hasText(input.agentContextRootPath)
      ? input.agentContextRootPath
      : PENDING_AGENT_CONTEXT_ROOT

    return [
      await buildSystemPrompt({
        agentContextRootPath,
        chatMode: input.chatMode,
        supportsNativeTools: true,
      }),
      JSON.stringify(getCodexToolDefinitions(input.chatMode)),
    ]
  }

  if (input.providerId === 'openai-compatible') {
    const agentContextRootPath = hasText(input.agentContextRootPath)
      ? input.agentContextRootPath
      : PENDING_AGENT_CONTEXT_ROOT

    return [
      await buildSystemPrompt({
        agentContextRootPath,
        chatMode: input.chatMode,
        supportsNativeTools: true,
      }),
      JSON.stringify(getOpenAICompatibleToolDefinitions(input.chatMode).map((toolDefinition) => toolDefinition.tool)),
    ]
  }

  if (input.providerId === 'openai') {
    return [PROVIDER_SYSTEM_INSTRUCTIONS]
  }

  if (input.providerId === 'anthropic') {
    return [PROVIDER_SYSTEM_INSTRUCTIONS]
  }

  if (input.providerId === 'google') {
    return [PROVIDER_SYSTEM_INSTRUCTIONS]
  }

  if (input.providerId === 'mistral') {
    const agentContextRootPath = hasText(input.agentContextRootPath)
      ? input.agentContextRootPath
      : PENDING_AGENT_CONTEXT_ROOT

    return [
      await buildSystemPrompt({
        agentContextRootPath,
        chatMode: input.chatMode,
        supportsNativeTools: true,
      }),
      JSON.stringify(getOpenAICompatibleToolDefinitions(input.chatMode).map((toolDefinition) => toolDefinition.tool)),
    ]
  }

  const fallbackRootPath = hasText(input.agentContextRootPath) ? input.agentContextRootPath : PENDING_AGENT_CONTEXT_ROOT
  return [
    buildAgentPrompt({
      agentContextRootPath: fallbackRootPath,
      chatMode: input.chatMode,
      supportsNativeTools: false,
    }),
  ]
}

export async function estimateChatContextUsage(
  input: EstimateContextUsageInput,
): Promise<ContextUsageEstimate> {
  const [systemPromptSegments, messageSegments] = await Promise.all([
    getSystemPromptSegments(input),
    Promise.resolve(getProviderHistorySegments(input.messages, input.providerId)),
  ])

  const systemPromptTokens = estimateTokensFromSegments(systemPromptSegments)
  const historyTokens = estimateTokensFromSegments(messageSegments.historySegments)
  const toolResultsTokens = estimateTokensFromSegments(messageSegments.toolResultSegments)
  const totalTokens = systemPromptTokens + historyTokens + toolResultsTokens

  return {
    historyTokens,
    maxTokens: CONTEXT_USAGE_MAX_TOKENS,
    systemPromptTokens,
    toolResultsTokens,
    totalTokens,
  }
}
