import { WorkspaceHeader } from './layout/WorkspaceHeader'

interface ChatHeaderProps {
  title: string
  isSidebarOpen: boolean
}

export function ChatHeader({ title, isSidebarOpen }: ChatHeaderProps) {
  return (
    <WorkspaceHeader
      title={title}
      isSidebarOpen={isSidebarOpen}
      leadingPaddingClassName={isSidebarOpen ? '' : 'pl-[132px] md:pl-[136px]'}
    />
  )
}
