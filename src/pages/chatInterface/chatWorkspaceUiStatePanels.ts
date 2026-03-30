import type { ChatInterfaceRightPanelTab } from "../../hooks/useChatInterfaceController";

interface WorkspacePanelStateInput {
  conversationDiffPanelWidth: number;
  isExplorerOpen: boolean;
  isRightPanelOpen: boolean;
  rightPanelTab: ChatInterfaceRightPanelTab;
  sourceControlPanelWidth: number;
  workspaceExplorerWidth: number;
}

export function getActiveWorkspacePanelWidth({
  conversationDiffPanelWidth,
  isExplorerOpen,
  isRightPanelOpen,
  rightPanelTab,
  sourceControlPanelWidth,
  workspaceExplorerWidth,
}: WorkspacePanelStateInput) {
  if (isExplorerOpen) {
    return workspaceExplorerWidth;
  }

  if (isRightPanelOpen) {
    return rightPanelTab === "diff"
      ? conversationDiffPanelWidth
      : sourceControlPanelWidth;
  }

  return null;
}
