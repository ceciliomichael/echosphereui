import type { ChatInterfaceRightPanelTab } from "../../hooks/useChatInterfaceController";
import type { AppSettings } from "../../types/chat";
import type { WorkspaceFileTab } from "../../components/workspaceExplorer/types";

export const DEFAULT_TERMINAL_WORKSPACE_KEY = "__global__";

export interface WorkspaceUiSession {
  activeFilePath: string | null;
  isExplorerOpen: boolean;
  isRightPanelOpen: boolean;
  isTabsVisible: boolean;
  rightPanelTab: ChatInterfaceRightPanelTab;
  tabs: WorkspaceFileTab[];
}

export interface WorkspaceClipboardEntry {
  mode: "copy" | "cut";
  relativePath: string;
}

export interface UseChatWorkspaceUiStateInput {
  activeConversationId: string | null;
  activeWorkspacePath: string | null;
  diffPanelWidth: number;
  isRightPanelOpen: boolean;
  isSidebarOpen: boolean;
  onDiffPanelWidthChange: (nextWidth: number) => void;
  onDiffPanelWidthCommit: (nextWidth: number) => void;
  onRightPanelOpenChange: (nextValue: boolean) => void;
  onRightPanelTabChange: (nextTab: ChatInterfaceRightPanelTab) => void;
  onUpdateSettings: (
    input: Partial<AppSettings>,
  ) => Promise<AppSettings | null>;
  rightPanelTab: ChatInterfaceRightPanelTab;
  selectedFolderId: string | null;
  setIsSidebarOpen: (nextValue: boolean) => void;
  settings: AppSettings;
}

export interface ChatWorkspaceUiState {
  activeWorkspaceFilePath: string | null;
  activeWorkspacePath: string | null;
  conversationDiffPanelWidth: number;
  handleCloseWorkspaceTab: (relativePath: string) => void;
  handleConversationDiffPanelWidthChange: (nextWidth: number) => void;
  handleConversationDiffPanelWidthCommit: (nextWidth: number) => void;
  handleCopyWorkspaceEntry: (relativePath: string) => Promise<void>;
  handleCreateWorkspaceEntry: (
    relativePath: string,
    isDirectory: boolean,
  ) => Promise<void>;
  handleCutWorkspaceEntry: (relativePath: string) => Promise<void>;
  handleDeleteWorkspaceEntry: (relativePath: string) => Promise<void>;
  handleImportWorkspaceEntry: (
    sourcePath: string,
    targetDirectoryRelativePath: string,
  ) => Promise<void>;
  handleMoveWorkspaceEntry: (
    relativePath: string,
    targetDirectoryRelativePath: string,
  ) => Promise<void>;
  handleOpenDiffPanel: () => void;
  handleOpenSourceControlPanel: () => void;
  handleOpenWorkspaceFile: (relativePath: string) => void;
  handlePasteWorkspaceEntry: (
    targetDirectoryRelativePath: string,
  ) => Promise<void>;
  handleRenameWorkspaceEntry: (
    relativePath: string,
    nextRelativePath: string,
  ) => Promise<void>;
  handleSelectWorkspaceTab: (relativePath: string) => void;
  handleSourceControlPanelWidthChange: (nextWidth: number) => void;
  handleSourceControlPanelWidthCommit: (nextWidth: number) => void;
  handleSidebarOpenChange: (nextSidebarOpen: boolean) => void;
  handleToggleExplorerPanel: () => void;
  handleWorkspaceEditorWidthChange: (nextWidth: number) => void;
  handleWorkspaceEditorWidthCommit: (nextWidth: number) => void;
  handleWorkspaceExplorerWidthChange: (nextWidth: number) => void;
  handleWorkspaceExplorerWidthCommit: (nextWidth: number) => void;
  handleWorkspaceFileContentChange: (
    relativePath: string,
    content: string,
  ) => void;
  isExplorerOpen: boolean;
  isTerminalOpen: boolean;
  isWorkspaceTabsPanelOpen: boolean;
  sourceControlPanelWidth: number;
  terminalPanelHeight: number;
  workspaceClipboard: WorkspaceClipboardEntry | null;
  workspaceEditorWidth: number;
  workspaceExplorerWidth: number;
  workspaceFileTabs: WorkspaceFileTab[];
}
