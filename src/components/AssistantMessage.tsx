import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { chatMessageContentWidthClassName } from "../lib/chatStyles";
import { normalizeAssistantMessageContent } from "../lib/chatMessageContent";
import type {
  AssistantWaitingIndicatorVariant,
  ToolInvocationTrace,
} from "../types/chat";
import { MarkdownRenderer } from "./chat/MarkdownRenderer";
import { ThinkingBlock } from "./chat/ThinkingBlock";
import { ThinkingIndicator } from "./chat/ThinkingIndicator";
import { ToolInvocationBlock } from "./chat/ToolInvocationBlock";
import { ToolInvocationGroup } from "./chat/ToolInvocationGroup";
import {
  getToolInvocationDisplayEntries,
  type ToolInvocationDisplayEntry,
} from "./chat/toolInvocationPresentation";
import type { ToolDecisionSubmission } from "./chat/ToolDecisionRequestCard";

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  isTextStreaming?: boolean;
  reasoningCompletedAt?: number;
  reasoningContent?: string;
  showCopyButton?: boolean;
  timestamp: number;
  toolInvocations?: ToolInvocationTrace[];
  onToolDecisionSubmit?: (
    invocation: ToolInvocationTrace,
    submission: ToolDecisionSubmission,
  ) => void;
  waitingIndicatorVariant?: AssistantWaitingIndicatorVariant;
  workspaceRootPath?: string | null;
}

function isStandaloneToolInvocation(toolName: string) {
  return toolName === 'apply' || toolName === 'apply_patch'
}

interface RenderedToolBlock {
  entries: readonly ToolInvocationDisplayEntry[]
  key: string
  kind: 'block' | 'group'
}

function buildRenderedToolBlocks(entries: readonly ToolInvocationDisplayEntry[]) {
  const renderedBlocks: RenderedToolBlock[] = []
  let groupedEntries: ToolInvocationDisplayEntry[] = []

  const flushGroupedEntries = () => {
    if (groupedEntries.length === 0) {
      return
    }

    renderedBlocks.push({
      entries: groupedEntries,
      key: groupedEntries.map((entry) => entry.key).join(':'),
      kind: 'group',
    })

    groupedEntries = []
  }

  for (const entry of entries) {
    if (isStandaloneToolInvocation(entry.invocation.toolName)) {
      flushGroupedEntries()
      renderedBlocks.push({
        entries: [entry],
        key: entry.key,
        kind: 'block',
      })
      continue
    }

    groupedEntries.push(entry)
  }

  flushGroupedEntries()

  return renderedBlocks
}

export function AssistantMessage({
  content,
  isStreaming = false,
  isTextStreaming = false,
  reasoningCompletedAt,
  reasoningContent = "",
  showCopyButton = false,
  timestamp,
  toolInvocations = [],
  onToolDecisionSubmit,
  waitingIndicatorVariant = "thinking",
  workspaceRootPath = null,
}: AssistantMessageProps) {
  const [isCopied, setIsCopied] = useState(false);
  const normalizedContent = normalizeAssistantMessageContent({
    content,
    reasoningContent,
  });
  const hasContent = normalizedContent.content.trim().length > 0;
  const hasReasoningContent =
    normalizedContent.reasoningContent.trim().length > 0;
  const hasAssistantText = hasContent || hasReasoningContent;
  const hasActiveReasoningBlock =
    hasReasoningContent && reasoningCompletedAt === undefined;
  const hasRunningToolInvocation = toolInvocations.some(
    (invocation) => invocation.state === "running",
  );
  const shouldShowWaitingIndicator =
    isStreaming &&
    !isTextStreaming &&
    !hasRunningToolInvocation &&
    !hasActiveReasoningBlock;
  const copyableText = [
    normalizedContent.reasoningContent.trim(),
    normalizedContent.content.trim(),
  ]
    .filter((value) => value.length > 0)
    .join("\n\n");
  const canShowCopyButton =
    showCopyButton && !isStreaming && copyableText.length > 0;
  const messagePaddingClassName = canShowCopyButton ? "pb-5 pr-5" : "";
  const toolDisplayEntries = toolInvocations.flatMap((invocation) =>
    getToolInvocationDisplayEntries(invocation),
  );
  const renderedToolBlocks = buildRenderedToolBlocks(toolDisplayEntries);

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsCopied(false);
    }, 1400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCopied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyableText);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  }

  if (
    !hasContent &&
    !hasReasoningContent &&
    toolInvocations.length === 0 &&
    !shouldShowWaitingIndicator
  ) {
    return null;
  }

  return (
    <div
      className={[
        "group relative space-y-2",
        messagePaddingClassName,
        chatMessageContentWidthClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasReasoningContent ? (
        <ThinkingBlock
          content={normalizedContent.reasoningContent}
          isComplete={!isStreaming}
          reasoningCompletedAt={reasoningCompletedAt}
          startTime={timestamp}
        />
      ) : null}

      {hasContent ? (
        <MarkdownRenderer
          content={normalizedContent.content}
          className="text-left text-[15px]"
          isStreaming={isStreaming}
        />
      ) : null}

      {renderedToolBlocks.map((block) =>
        block.kind === 'group' ? (
          <ToolInvocationGroup
            key={block.key}
            entries={block.entries}
            hasAssistantText={hasAssistantText}
            onToolDecisionSubmit={onToolDecisionSubmit}
            workspaceRootPath={workspaceRootPath}
          />
        ) : (
          block.entries.map((displayEntry) => (
            <ToolInvocationBlock
              key={displayEntry.key}
              invocation={displayEntry.invocation}
              onToolDecisionSubmit={onToolDecisionSubmit}
              workspaceRootPath={workspaceRootPath}
            />
          ))
        ),
      )}

      {shouldShowWaitingIndicator ? (
        <ThinkingIndicator variant={waitingIndicatorVariant} />
      ) : null}

      {canShowCopyButton ? (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute bottom-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center text-muted-foreground opacity-0 pointer-events-none transition-[color,opacity,transform] duration-150 hover:scale-105 hover:text-foreground group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
          aria-label={isCopied ? "Copied message" : "Copy message"}
          title={isCopied ? "Copied" : "Copy"}
        >
          {isCopied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      ) : null}
    </div>
  );
}
