import type { ModelMessage } from 'ai'
import { normalizeAssistantMessageContent } from '../../../src/lib/chatMessageContent'
import { getToolResultModelContent } from '../../../src/lib/toolResultContent'
import type { ChatMode, Message, ReasoningEffort } from '../../../src/types/chat'
import { buildChatCompressionSystemPrompt } from './prompts/compression'

interface CompressionStreamFactoryInput {
  messages: ModelMessage[]
  model: string
  reasoningEffort: ReasoningEffort
  signal: AbortSignal
  system: string
}

type CompressionStreamFactory = (
  input: CompressionStreamFactoryInput,
) => Promise<{
  fullStream: AsyncIterable<{ text?: string; type: string }>
}>

export interface CompressChatHistoryInput {
  agentContextRootPath: string
  chatMode: ChatMode
  createStream: CompressionStreamFactory
  messages: Message[]
  modelId: string
  reasoningEffort: ReasoningEffort
}

function formatUserMessage(message: Message) {
  const textAttachments = (message.attachments ?? [])
    .filter((attachment) => attachment.kind === 'text')
    .map((attachment) => `Attachment (${attachment.fileName}):\n${attachment.textContent}`)
  return [message.content.trim(), ...textAttachments].filter((part) => part.length > 0).join('\n\n')
}

function formatAssistantMessage(message: Message) {
  const normalized = normalizeAssistantMessageContent(message)
  const reasoning = normalized.reasoningContent.trim()
  const content = normalized.content.trim()
  const parts = [reasoning, content].filter((part) => part.length > 0)

  const completedInvocations = (message.toolInvocations ?? []).filter((invocation) => invocation.state !== 'running')
  if (completedInvocations.length > 0) {
    const invocationLines = completedInvocations.map((invocation) => {
      const resultContent = invocation.resultContent?.trim() ?? ''
      const resultSuffix = resultContent.length > 0 ? `\nResult:\n${resultContent}` : ''
      return `Tool Invocation: ${invocation.toolName}\nArguments:\n${invocation.argumentsText}${resultSuffix}`
    })
    parts.push(invocationLines.join('\n\n'))
  }

  return parts.join('\n\n').trim()
}

function formatToolMessage(message: Message) {
  const content = getToolResultModelContent(message.content)
  return content.trim()
}

function formatConversationTranscript(messages: Message[]) {
  const blocks: string[] = []

  messages.forEach((message, index) => {
    let roleLabel = ''
    let content = ''

    if (message.role === 'user') {
      roleLabel = 'USER'
      content = formatUserMessage(message)
    } else if (message.role === 'assistant') {
      roleLabel = 'ASSISTANT'
      content = formatAssistantMessage(message)
    } else {
      roleLabel = 'TOOL_RESULT'
      content = formatToolMessage(message)
    }

    const normalizedContent = content.trim().length > 0 ? content.trim() : '[empty]'
    blocks.push(`Turn ${index + 1} | ${roleLabel}\n${normalizedContent}`)
  })

  return blocks.join('\n\n')
}

async function collectStreamedText(
  createStream: CompressionStreamFactory,
  input: CompressionStreamFactoryInput,
) {
  const stream = await createStream(input)
  let text = ''
  for await (const part of stream.fullStream) {
    if (part.type === 'text-delta' && typeof part.text === 'string') {
      text += part.text
    }
  }

  return text.trim()
}

function containsCampSections(summary: string) {
  const requiredSections = [
    'Goal',
    'Current State',
    'Done',
    'Decisions',
    'Open Items',
    'Key Refs',
    'Next Step',
  ]
  const normalized = summary.toLowerCase()
  return requiredSections.every((sectionName) => normalized.includes(sectionName.toLowerCase()))
}

function buildCampRepairPrompt(candidateSummary: string) {
  return [
    'Rewrite the following into strict CAMP format.',
    'Return only CAMP text with section headings on separate lines and multiline bullets.',
    'Do not include any preface like "Updated memory" or "Summary".',
    '',
    candidateSummary,
  ].join('\n')
}

function stripThinkTags(value: string) {
  return value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think\b[^>]*\/?>/gi, '')
    .trim()
}

export async function compressChatHistory(input: CompressChatHistoryInput) {
  const transcript = formatConversationTranscript(input.messages)
  const modelMessages: ModelMessage[] = [
    {
      role: 'user',
      content: `Full conversation transcript:\n\n${transcript}`,
    },
  ]
  const abortController = new AbortController()
  const systemPrompt = buildChatCompressionSystemPrompt(input.chatMode, input.agentContextRootPath)
  const rawSummary = await collectStreamedText(input.createStream, {
    messages: modelMessages,
    model: input.modelId,
    reasoningEffort: input.reasoningEffort,
    signal: abortController.signal,
    system: systemPrompt,
  })
  const summary = stripThinkTags(rawSummary)

  if (summary.length === 0) {
    throw new Error('The compression model returned an empty summary.')
  }

  if (containsCampSections(summary)) {
    return summary
  }

  const rawRepairedSummary = await collectStreamedText(input.createStream, {
    messages: [
      {
        role: 'user',
        content: buildCampRepairPrompt(summary),
      },
    ],
    model: input.modelId,
    reasoningEffort: input.reasoningEffort,
    signal: abortController.signal,
    system: systemPrompt,
  })
  const repairedSummary = stripThinkTags(rawRepairedSummary)

  if (repairedSummary.length === 0) {
    throw new Error('The compression model returned an empty summary.')
  }

  return repairedSummary
}
