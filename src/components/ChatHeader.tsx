import { WorkspaceHeader } from './layout/WorkspaceHeader'

interface ChatHeaderProps {
  title: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ChatHeader({ title, isSidebarOpen, onToggleSidebar }: ChatHeaderProps) {
  return (
    <WorkspaceHeader
      title={title}
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={onToggleSidebar}
      openSidebarLabel="Open history"
    />
  )
}
