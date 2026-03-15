import { useEffect, useRef } from 'react'

interface UseWorkspaceKeyboardShortcutsOptions {
  enabled?: boolean
  onToggleSidebar: () => void
  onToggleDiffPanel?: () => void
  onCreateConversation?: () => void | Promise<void>
}

export function useWorkspaceKeyboardShortcuts({
  enabled = true,
  onToggleSidebar,
  onToggleDiffPanel,
  onCreateConversation,
}: UseWorkspaceKeyboardShortcutsOptions) {
  const toggleSidebarRef = useRef(onToggleSidebar)
  const toggleDiffPanelRef = useRef(onToggleDiffPanel)
  const createConversationRef = useRef(onCreateConversation)

  useEffect(() => {
    toggleSidebarRef.current = onToggleSidebar
    toggleDiffPanelRef.current = onToggleDiffPanel
    createConversationRef.current = onCreateConversation
  }, [onCreateConversation, onToggleDiffPanel, onToggleSidebar])

  useEffect(() => {
    if (!enabled) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'b') {
        if (event.altKey) {
          if (!toggleDiffPanelRef.current) {
            return
          }

          event.preventDefault()
          toggleDiffPanelRef.current()
          return
        }

        event.preventDefault()
        toggleSidebarRef.current()
        return
      }

      if (!event.altKey && key === 'n' && createConversationRef.current) {
        event.preventDefault()
        void createConversationRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
