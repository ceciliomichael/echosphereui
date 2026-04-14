import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMode, Message } from "../../types/chat";
import type { ChatRuntimeSelection } from "../../hooks/chatMessageRuntime";
import {
  buildCompressedHistoryAcknowledgementMessage,
  buildCompressedHistoryMessage,
} from "../../lib/chatCompression";

interface CompressionSelection {
  hasConfiguredProvider: boolean;
  modelId: string;
  providerId: ChatRuntimeSelection["providerId"];
  reasoningEffort: ChatRuntimeSelection["reasoningEffort"];
}

interface UseChatCompressionInput {
  activeWorkspacePath: string | null;
  chatMode: ChatMode;
  clearQueuedMessages: () => void;
  compressionSelection: CompressionSelection;
  createConversation: () => Promise<void>;
  isBusy: boolean;
  messages: Message[];
  isCompressingChat: boolean;
  runtimeSelection: ChatRuntimeSelection;
  sendProgrammaticMessage: (
    runtimeSelection: ChatRuntimeSelection,
    messageText: string,
    options?: {
      chatMode?: ChatMode
      forceNewConversation?: boolean
      syntheticAssistantMessage?: Message
      title?: string
    },
  ) => Promise<void>;
  setError: (errorMessage: string | null) => void;
  setIsCompressingChat: (nextValue: boolean) => void;
}

function buildCompressionSeedMessage(summary: string) {
  return buildCompressedHistoryMessage(summary);
}

function buildCompressionAcknowledgementMessage() {
  return buildCompressedHistoryAcknowledgementMessage(uuidv4());
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
    compressionSelection,
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

    if (!compressionSelection.hasConfiguredProvider || !compressionSelection.providerId) {
      setError("Configure a provider before compressing this chat.");
      return;
    }

    if (compressionSelection.modelId.trim().length === 0) {
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
        modelId: compressionSelection.modelId,
        providerId: compressionSelection.providerId,
        reasoningEffort: compressionSelection.reasoningEffort,
      });

      await createConversation();
      await sendProgrammaticMessage(
        runtimeSelection,
        buildCompressionSeedMessage(summary),
        {
          chatMode,
          forceNewConversation: true,
          syntheticAssistantMessage: buildCompressionAcknowledgementMessage(),
          title: "Compressed text",
        },
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
    compressionSelection,
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
