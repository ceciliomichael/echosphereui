import { chatMessageContentWidthClassName } from '../lib/chatStyles'
import type { AssistantWaitingIndicatorVariant, ToolInvocationTrace } from '../types/chat'
import { MarkdownRenderer } from './chat/MarkdownRenderer'
import { ThinkingBlock } from './chat/ThinkingBlock'
import { ThinkingIndicator } from './chat/ThinkingIndicator'
import { ToolInvocationBlock } from './chat/ToolInvocationBlock'

interface AssistantMessageProps {
  content: string
  isStreaming?: boolean
  isTextStreaming?: boolean
  reasoningCompletedAt?: number
  reasoningContent?: string
  timestamp: number
  toolInvocations?: ToolInvocationTrace[]
  waitingIndicatorVariant?: AssistantWaitingIndicatorVariant
}

export function AssistantMessage({
  content,
  isStreaming = false,
  isTextStreaming = false,
  reasoningCompletedAt,
  reasoningContent = '',
  timestamp,
  toolInvocations = [],
  waitingIndicatorVariant = 'thinking',
}: AssistantMessageProps) {
  const hasContent = content.trim().length > 0
  const hasRunningToolInvocation = toolInvocations.some((invocation) => invocation.state === 'running')
  const shouldShowWaitingIndicator = isStreaming && !isTextStreaming && !hasRunningToolInvocation

  return (
    <div className={[chatMessageContentWidthClassName, 'space-y-2'].join(' ')}>
      {reasoningContent.trim().length > 0 ? (
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

      {shouldShowWaitingIndicator ? <ThinkingIndicator variant={waitingIndicatorVariant} /> : null}
    </div>
  )
}
