import { WorkspaceHeader } from './layout/WorkspaceHeader'
import { InlineEditableTitle } from './chat/InlineEditableTitle'

interface ChatHeaderProps {
  title: string
  isSidebarOpen: boolean
  onRenameTitle: (nextTitle: string) => void | Promise<void>
}

export function ChatHeader({ title, isSidebarOpen, onRenameTitle }: ChatHeaderProps) {
  return (
    <WorkspaceHeader
      title={<InlineEditableTitle value={title} onSave={onRenameTitle} />}
      isSidebarOpen={isSidebarOpen}
      leadingPaddingClassName={isSidebarOpen ? '' : 'pl-[132px] md:pl-[136px]'}
    />
  )
}
