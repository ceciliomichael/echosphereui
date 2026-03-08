import { useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'

interface SettingsDialogProps {
  onClose: () => void
}

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-foreground/20 px-4 py-6 backdrop-blur-[2px]">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0"
        onClick={onClose}
      />
      <section className="relative z-10 flex w-full max-w-lg flex-col rounded-[28px] border border-border bg-surface p-5 shadow-soft md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtle-foreground">Settings</p>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Workspace preferences</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This settings surface is ready for app-level preferences. For now, it exposes the shortcuts that
                already exist in the workspace.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground transition-colors duration-200 ease-out hover:bg-background hover:text-foreground"
            aria-label="Close settings"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="mt-6 rounded-2xl bg-background p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-foreground shadow-sm">
              <Keyboard size={18} strokeWidth={2.1} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
              <p className="text-sm text-muted-foreground">Quick actions available anywhere in the chat workspace.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3 shadow-sm">
              <span className="text-sm text-foreground">Toggle sidebar</span>
              <kbd className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                Ctrl + B
              </kbd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface px-4 py-3 shadow-sm">
              <span className="text-sm text-foreground">Create a new thread</span>
              <kbd className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
                Ctrl + N
              </kbd>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
