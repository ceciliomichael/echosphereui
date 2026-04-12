import { useCallback } from "react";
import type { ChatMode, Message } from "../../types/chat";
import type { ChatRuntimeSelection } from "../../hooks/chatMessageRuntime";
import { buildCompressedHistoryMessage } from "../../lib/chatCompression";

interface UseChatCompressionInput {
  activeWorkspacePath: string | null;
  chatMode: ChatMode;
  clearQueuedMessages: () => void;
  createConversation: () => Promise<void>;
  isBusy: boolean;
  messages: Message[];
  isCompressingChat: boolean;
  runtimeSelection: ChatRuntimeSelection;
  sendProgrammaticMessage: (
    runtimeSelection: ChatRuntimeSelection,
    messageText: string,
    options?: { chatMode?: ChatMode; forceNewConversation?: boolean; title?: string },
  ) => Promise<void>;
  setError: (errorMessage: string | null) => void;
  setIsCompressingChat: (nextValue: boolean) => void;
}

function buildCompressionSeedMessage(summary: string) {
  return buildCompressedHistoryMessage(summary);
}

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

export function useChatCompression(input: UseChatCompressionInput) {
  const {
    activeWorkspacePath,
    chatMode,
    clearQueuedMessages,
    createConversation,
    isBusy,
    isCompressingChat,
    messages,
    runtimeSelection,
    sendProgrammaticMessage,
    setError,
    setIsCompressingChat,
  } = input;

  const handleCompressChat = useCallback(async () => {
    if (isCompressingChat) {
      return;
    }

    if (messages.length === 0) {
      setError("Send at least one message before compressing the chat.");
      return;
    }

    if (isBusy) {
      setError(
        "Wait for the current response to finish before compressing this chat.",
      );
      return;
    }

    if (!activeWorkspacePath) {
      setError("Open a chat with workspace context before compressing it.");
      return;
    }

    if (
      !runtimeSelection.hasConfiguredProvider ||
      !runtimeSelection.providerId
    ) {
      setError("Configure a provider before compressing this chat.");
      return;
    }

    if (runtimeSelection.modelId.trim().length === 0) {
      setError("Select a model before compressing this chat.");
      return;
    }

    setIsCompressingChat(true);
    setError(null);
    clearQueuedMessages();

    try {
      const summary = await window.echosphereChat.compressConversation({
        agentContextRootPath: activeWorkspacePath,
        chatMode,
        messages,
        modelId: runtimeSelection.modelId,
        providerId: runtimeSelection.providerId,
        reasoningEffort: runtimeSelection.reasoningEffort,
      });

      await createConversation();
      await sendProgrammaticMessage(
        runtimeSelection,
        buildCompressionSeedMessage(summary),
        { chatMode, forceNewConversation: true, title: "Compressed text" },
      );
    } catch (caughtError) {
      console.error("Failed to compress chat history", caughtError);
      setError(
        toErrorMessage(caughtError, "Unable to compress the current chat."),
      );
    } finally {
      setIsCompressingChat(false);
    }
  }, [
    activeWorkspacePath,
    chatMode,
    clearQueuedMessages,
    createConversation,
    isBusy,
    isCompressingChat,
    messages,
    runtimeSelection,
    sendProgrammaticMessage,
    setError,
    setIsCompressingChat,
  ]);

  return {
    handleCompressChat,
  };
}
