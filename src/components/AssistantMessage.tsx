import { chatMessageContentWidthClassName } from '../lib/chatStyles'
import type { ToolInvocationTrace } from '../types/chat'
import { MarkdownRenderer } from './chat/MarkdownRenderer'
import { ThinkingBlock } from './chat/ThinkingBlock'
import { ThinkingIndicator } from './chat/ThinkingIndicator'
import { ToolInvocationBlock } from './chat/ToolInvocationBlock'

interface AssistantMessageProps {
  content: string
  isStreaming?: boolean
  reasoningCompletedAt?: number
  reasoningContent?: string
  timestamp: number
  toolInvocations?: ToolInvocationTrace[]
}

export function AssistantMessage({
  content,
  isStreaming = false,
  reasoningCompletedAt,
  reasoningContent = '',
  timestamp,
  toolInvocations = [],
}: AssistantMessageProps) {
  const hasContent = content.trim().length > 0
  const shouldShowThinking = reasoningContent.trim().length > 0
  const shouldShowWaitingIndicator = isStreaming && !hasContent && !shouldShowThinking && toolInvocations.length === 0

  return (
    <div className={[chatMessageContentWidthClassName, 'space-y-2'].join(' ')}>
      {shouldShowWaitingIndicator ? <ThinkingIndicator /> : null}

      {shouldShowThinking ? (
        <ThinkingBlock
          content={reasoningContent}
          isComplete={!isStreaming}
          reasoningCompletedAt={reasoningCompletedAt}
          startTime={timestamp}
        />
      ) : null}

      {toolInvocations.map((invocation) => (
        <ToolInvocationBlock key={invocation.id} invocation={invocation} />
      ))}

      {hasContent ? (
        <MarkdownRenderer content={content} className="text-left text-[15px]" isStreaming={isStreaming} />
      ) : null}
    </div>
  )
}
