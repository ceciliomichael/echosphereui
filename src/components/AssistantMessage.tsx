import { chatMessageContentWidthClassName } from '../lib/chatStyles'
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
  const hasContent = content.trim().length > 0
  const hasReasoningContent = reasoningContent.trim().length > 0
  const hasActiveReasoningBlock = hasReasoningContent && reasoningCompletedAt === undefined
  const hasRunningToolInvocation = toolInvocations.some((invocation) => invocation.state === 'running')
  const shouldShowWaitingIndicator =
    isStreaming && !isTextStreaming && !hasRunningToolInvocation && !hasActiveReasoningBlock

  return (
    <div className={[chatMessageContentWidthClassName, 'space-y-2'].join(' ')}>
      {hasReasoningContent ? (
        <ThinkingBlock
          content={reasoningContent}
          isComplete={!isStreaming}
          reasoningCompletedAt={reasoningCompletedAt}
          startTime={timestamp}
        />
      ) : null}

      {toolInvocations.map((invocation) => (
        <ToolInvocationBlock
          key={invocation.id}
          invocation={invocation}
          onToolDecisionSubmit={onToolDecisionSubmit}
          workspaceRootPath={workspaceRootPath}
        />
      ))}

      {hasContent ? (
        <MarkdownRenderer content={content} className="text-left text-[15px]" isStreaming={isStreaming} />
      ) : null}

      {shouldShowWaitingIndicator ? <ThinkingIndicator variant={waitingIndicatorVariant} /> : null}
    </div>
  )
}
