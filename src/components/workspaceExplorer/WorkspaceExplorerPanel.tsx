import { memo } from 'react'
import { WorkspaceExplorerPanelView } from './workspaceExplorerPanel/WorkspaceExplorerPanelView'
import { useWorkspaceExplorerPanelState } from './workspaceExplorerPanel/useWorkspaceExplorerPanelState'
import type { WorkspaceExplorerPanelProps } from './workspaceExplorerPanel/workspaceExplorerPanelTypes'

export const WorkspaceExplorerPanel = memo(function WorkspaceExplorerPanel(props: WorkspaceExplorerPanelProps) {
  const panelState = useWorkspaceExplorerPanelState(props)

  return <WorkspaceExplorerPanelView {...props} panelState={panelState} />
})
