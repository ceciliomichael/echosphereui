import type { Message } from '../types/chat'

export interface AssistantMessageContentParts {
  content: string
  reasoningContent: string
}

interface AssistantMessageContentSplit extends AssistantMessageContentParts {
  hasThinkingTags: boolean
}

const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

export function normalizeMarkdownText(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
}

export function splitThinkingContent(input: string): AssistantMessageContentSplit {
  let content = ''
  let reasoningContent = ''
  let cursor = 0
  let insideThinkingBlock = false
  let hasThinkingTags = false

  while (cursor < input.length) {
    if (insideThinkingBlock) {
      const nextCloseTagIndex = input.indexOf(THINK_CLOSE_TAG, cursor)
      if (nextCloseTagIndex === -1) {
        reasoningContent += input.slice(cursor)
        break
      }

      reasoningContent += input.slice(cursor, nextCloseTagIndex)
      cursor = nextCloseTagIndex + THINK_CLOSE_TAG.length
      insideThinkingBlock = false
      continue
    }

    const nextOpenTagIndex = input.indexOf(THINK_OPEN_TAG, cursor)
    if (nextOpenTagIndex === -1) {
      content += input.slice(cursor)
      break
    }

    hasThinkingTags = true
    content += input.slice(cursor, nextOpenTagIndex)
    cursor = nextOpenTagIndex + THINK_OPEN_TAG.length
    insideThinkingBlock = true
  }

  return {
    content,
    reasoningContent,
    hasThinkingTags,
  }
}

function removeThinkingTags(input: string) {
  return input.replace(/<\/?think>/g, '')
}

function trimEdgeBlankLines(input: string) {
  return input.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '')
}

function hasThinkingMarkup(input: string) {
  return input.includes(THINK_OPEN_TAG) || input.includes(THINK_CLOSE_TAG)
}

function joinTextParts(parts: readonly string[]) {
  const nonEmptyParts = parts.filter((part) => part.length > 0)
  if (nonEmptyParts.length === 0) {
    return ''
  }

  return nonEmptyParts.join('\n\n')
}

export function normalizeAssistantMessageContent(message: Pick<Message, 'content' | 'reasoningContent'>): AssistantMessageContentParts {
  const splitContent = splitThinkingContent(message.content)
  const normalizedReasoningContent = joinTextParts([
    removeThinkingTags(message.reasoningContent ?? ''),
    splitContent.reasoningContent,
  ])
  const shouldTrimEdgeBlankLines = splitContent.hasThinkingTags || hasThinkingMarkup(message.reasoningContent ?? '')
  const normalizedContent = normalizeMarkdownText(splitContent.content)
  const normalizedReasoning = normalizeMarkdownText(normalizedReasoningContent)

  return {
    content: shouldTrimEdgeBlankLines ? trimEdgeBlankLines(normalizedContent) : normalizedContent,
    reasoningContent: shouldTrimEdgeBlankLines ? trimEdgeBlankLines(normalizedReasoning) : normalizedReasoning,
  }
}

export function hasMeaningfulAssistantContent(
  message: Pick<Message, 'content' | 'reasoningContent' | 'toolInvocations'>,
) {
  const normalizedContent = normalizeAssistantMessageContent(message)
  return (
    normalizedContent.content.trim().length > 0 ||
    normalizedContent.reasoningContent.trim().length > 0 ||
    (message.toolInvocations?.length ?? 0) > 0
  )
}
