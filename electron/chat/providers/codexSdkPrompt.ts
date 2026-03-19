import type { Message } from '../../../src/types/chat'
import { buildReplayableMessageHistory } from '../openaiCompatible/messageHistory'
import { buildSystemPrompt } from '../prompts'
import type { ProviderStreamRequest } from '../providerTypes'
import type { CodexNativeToolPolicy } from './codexNativeTools'
import { getUserMessageTextBlocks } from './messageAttachments'

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function toTranscriptSection(message: Message): string | null {
  if (message.role === 'assistant') {
    if (!hasText(message.content)) {
      return null
    }

    return `<assistant>\n${message.content}\n</assistant>`
  }

  if (message.role !== 'user') {
    return null
  }

  const messageBlocks = getUserMessageTextBlocks(message)
  if (messageBlocks.length === 0) {
    return null
  }

  const roleTag = message.userMessageKind === 'tool_result' ? 'tool_result' : 'user'
  return `<${roleTag}>\n${messageBlocks.join('\n\n')}\n</${roleTag}>`
}

export async function buildCodexSdkPrompt(
  request: ProviderStreamRequest,
  _nativeToolPolicy: CodexNativeToolPolicy,
) {
  const replayableHistory = buildReplayableMessageHistory(request.messages)
  const systemPrompt = await buildSystemPrompt({
    agentContextRootPath: request.agentContextRootPath,
    chatMode: request.chatMode,
    providerId: request.providerId,
    supportsNativeTools: true,
    terminalExecutionMode: request.terminalExecutionMode,
  })
  const transcriptSections = replayableHistory
    .map((message) => toTranscriptSection(message))
    .filter((section): section is string => section !== null)

  const promptSections = [
    '<system_instructions>',
    systemPrompt,
    '</system_instructions>',
    '<conversation_history>',
    ...transcriptSections,
    '</conversation_history>',
  ]

  return promptSections.filter((section): section is string => section !== null).join('\n\n')
}
