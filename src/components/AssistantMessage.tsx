import { chatMessageContentWidthClassName } from '../lib/chatStyles'
import { normalizeAssistantMessageContent } from '../lib/chatMessageContent'
import type { AssistantWaitingIndicatorVariant, ToolInvocationTrace } from '../types/chat'
import { MarkdownRenderer } from './chat/MarkdownRenderer'
import { ThinkingBlock } from './chat/ThinkingBlock'
import { ThinkingIndicator } from './chat/ThinkingIndicator'
import { ToolInvocationBlock } from './chat/ToolInvocationBlock'
import type { ToolDecisionSubmission } from './chat/ToolDecisionRequestCard'

interface AssistantMessageProps {
  content: string
  isStreaming?: boolean
  isTextStreaming?: boolean
  reasoningCompletedAt?: number
  reasoningContent?: string
  timestamp: number
  toolInvocations?: ToolInvocationTrace[]
  onToolDecisionSubmit?: (invocation: ToolInvocationTrace, submission: ToolDecisionSubmission) => void
  waitingIndicatorVariant?: AssistantWaitingIndicatorVariant
  workspaceRootPath?: string | null
}

export function AssistantMessage({
  content,
  isStreaming = false,
  isTextStreaming = false,
  reasoningCompletedAt,
  reasoningContent = '',
  timestamp,
  toolInvocations = [],
  onToolDecisionSubmit,
  waitingIndicatorVariant = 'thinking',
  workspaceRootPath = null,
}: AssistantMessageProps) {
  const normalizedContent = normalizeAssistantMessageContent({
    content,
    reasoningContent,
  })
  const hasContent = normalizedContent.content.trim().length > 0
  const hasReasoningContent = normalizedContent.reasoningContent.trim().length > 0
  const hasActiveReasoningBlock = hasReasoningContent && reasoningCompletedAt === undefined
  const hasRunningToolInvocation = toolInvocations.some((invocation) => invocation.state === 'running')
  const shouldShowWaitingIndicator =
    isStreaming && !isTextStreaming && !hasRunningToolInvocation && !hasActiveReasoningBlock

  if (!hasContent && !hasReasoningContent && toolInvocations.length === 0 && !shouldShowWaitingIndicator) {
    return null
  }

  return (
    <div className={[chatMessageContentWidthClassName, 'space-y-2'].join(' ')}>
      {hasReasoningContent ? (
        <ThinkingBlock
          content={normalizedContent.reasoningContent}
          isComplete={!isStreaming}
          reasoningCompletedAt={reasoningCompletedAt}
          startTime={timestamp}
        />
      ) : null}

      {hasContent ? (
        <MarkdownRenderer content={normalizedContent.content} className="text-left text-[15px]" isStreaming={isStreaming} />
      ) : null}

      {toolInvocations.map((invocation) => (
        <ToolInvocationBlock
          key={invocation.id}
          invocation={invocation}
          onToolDecisionSubmit={onToolDecisionSubmit}
          workspaceRootPath={workspaceRootPath}
        />
      ))}

      {shouldShowWaitingIndicator ? <ThinkingIndicator variant={waitingIndicatorVariant} /> : null}
    </div>
  )
}
