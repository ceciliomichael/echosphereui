import { memo } from "react";
import { WorkspaceTerminalPanelView } from "./workspaceTerminalPanel/WorkspaceTerminalPanelView";
import { useWorkspaceTerminalPanelState } from "./workspaceTerminalPanel/useWorkspaceTerminalPanelState";
import type { WorkspaceTerminalPanelProps } from "./workspaceTerminalPanel/workspaceTerminalPanelTypes";

export const WorkspaceTerminalPanel = memo(function WorkspaceTerminalPanel(
  props: WorkspaceTerminalPanelProps,
) {
  const panelState = useWorkspaceTerminalPanelState(props);

  return <WorkspaceTerminalPanelView panelState={panelState} />;
});
