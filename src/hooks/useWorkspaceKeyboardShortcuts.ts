import { useEffect, useRef } from 'react'

interface UseWorkspaceKeyboardShortcutsOptions {
  onToggleSidebar: () => void
  onCreateConversation?: () => void | Promise<void>
}

export function useWorkspaceKeyboardShortcuts({
  onToggleSidebar,
  onCreateConversation,
}: UseWorkspaceKeyboardShortcutsOptions) {
  const toggleSidebarRef = useRef(onToggleSidebar)
  const createConversationRef = useRef(onCreateConversation)

  useEffect(() => {
    toggleSidebarRef.current = onToggleSidebar
    createConversationRef.current = onCreateConversation
  }, [onCreateConversation, onToggleSidebar])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'b') {
        event.preventDefault()
        toggleSidebarRef.current()
        return
      }

      if (key === 'n' && createConversationRef.current) {
        event.preventDefault()
        void createConversationRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
