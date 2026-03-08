import { getSettingsItem, type SettingsItemId } from './settingsItems'

interface SettingsContentProps {
  activeItemId: SettingsItemId
}

export function SettingsContent({ activeItemId }: SettingsContentProps) {
  const activeItem = getSettingsItem(activeItemId)

  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col py-2 md:py-4">
        <div className="rounded-[28px] border border-border bg-background p-5 shadow-sm md:p-7">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#F3F0FF] px-3 py-1 text-xs font-semibold tracking-[0.12em] text-[#6d5ed6] uppercase">
                Settings
              </span>
              <span className="text-sm text-muted-foreground">Placeholder screen</span>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-[30px]">
                {activeItem.label}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                This settings screen is wired into the workspace shell and ready for feature-specific controls when
                you decide what belongs here.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm font-semibold text-foreground">Section status</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {activeItem.description}
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm font-semibold text-foreground">Implementation note</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                The navigation is separate from the page shell, so each item can grow into its own module without
                bloating the screen entrypoint.
              </p>
            </section>
          </div>

          <section className="mt-4 flex min-h-[280px] items-center justify-center rounded-[28px] border border-border bg-surface-muted p-6 text-center">
            <div className="max-w-md">
              <p className="text-lg font-semibold text-foreground">No controls added yet</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This pane is intentionally empty for now, so you can plug real settings into each item without
                reworking the workspace structure.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
