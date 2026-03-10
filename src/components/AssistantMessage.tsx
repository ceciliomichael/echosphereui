import { chatMessageContentWidthClassName } from '../lib/chatStyles'
import { MarkdownRenderer } from './chat/MarkdownRenderer'
import { ThinkingBlock } from './chat/ThinkingBlock'
import { ThinkingIndicator } from './chat/ThinkingIndicator'

interface AssistantMessageProps {
  content: string
  isStreaming?: boolean
  reasoningCompletedAt?: number
  reasoningContent?: string
  timestamp: number
}

export function AssistantMessage({
  content,
  isStreaming = false,
  reasoningCompletedAt,
  reasoningContent = '',
  timestamp,
}: AssistantMessageProps) {
  const hasContent = content.trim().length > 0
  const shouldShowThinking = reasoningContent.trim().length > 0
  const shouldShowWaitingIndicator = isStreaming && !hasContent && !shouldShowThinking

  return (
    <div className={chatMessageContentWidthClassName}>
      {shouldShowWaitingIndicator ? <ThinkingIndicator /> : null}

      {shouldShowThinking ? (
        <ThinkingBlock
          content={reasoningContent}
          isComplete={!isStreaming}
          reasoningCompletedAt={reasoningCompletedAt}
          startTime={timestamp}
        />
      ) : null}

      {hasContent ? <MarkdownRenderer content={content} className="text-left text-[15px]" isStreaming={isStreaming} /> : null}
    </div>
  )
}
