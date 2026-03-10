import type { ReactNode } from 'react'

interface SettingsPanelLayoutProps {
  children: ReactNode
  title: string
}

interface SettingsSectionProps {
  children: ReactNode
  title: string
}

interface SettingsRowProps {
  children: ReactNode
  description: string
  title: string
}

export function SettingsPanelLayout({ children, title }: SettingsPanelLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-[780px] flex-1 flex-col gap-5 py-3 md:py-4">
      <header className="pb-3">
        <h2 className="text-[21px] font-medium tracking-tight text-foreground md:text-[24px]">{title}</h2>
      </header>
      {children}
    </div>
  )
}

export function SettingsSection({ children, title }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <header>
        <h3 className="text-[15px] font-medium text-foreground md:text-base">{title}</h3>
      </header>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">{children}</div>
    </section>
  )
}

export function SettingsRow({ children, description, title }: SettingsRowProps) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 md:flex-row md:items-center md:justify-between md:gap-6 md:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground md:text-sm">{title}</p>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground md:text-sm">{description}</p>
      </div>

      {children}
    </div>
  )
}
