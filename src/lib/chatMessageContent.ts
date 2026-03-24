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

const TOOL_CALL_SCAFFOLD_LINE_PATTERN = /^(?:assistant|tool)\s+to=/i
const TOOL_CALL_JSON_LINE_PATTERN = /^json\b.*\{/i

function stripAssistantToolCallScaffolding(input: string) {
  const lines = input.split(/\r?\n/)
  let hasChanges = false
  const filteredLines: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (
      trimmedLine.length > 0 &&
      (TOOL_CALL_SCAFFOLD_LINE_PATTERN.test(trimmedLine) || TOOL_CALL_JSON_LINE_PATTERN.test(trimmedLine))
    ) {
      hasChanges = true
      continue
    }

    filteredLines.push(line)
  }

  return hasChanges ? filteredLines.join('\n') : input
}

export function normalizeAssistantMessageContent(message: Pick<Message, 'content' | 'reasoningContent'>): AssistantMessageContentParts {
  const splitContent = splitThinkingContent(message.content)
  const normalizedReasoningContent = joinTextParts([
    removeThinkingTags(message.reasoningContent ?? ''),
    splitContent.reasoningContent,
  ])
  const shouldTrimEdgeBlankLines = splitContent.hasThinkingTags || hasThinkingMarkup(message.reasoningContent ?? '')
  const normalizedContent = normalizeMarkdownText(stripAssistantToolCallScaffolding(splitContent.content))
  const normalizedReasoning = normalizeMarkdownText(stripAssistantToolCallScaffolding(normalizedReasoningContent))

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
