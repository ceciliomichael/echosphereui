interface WorkspaceHeaderProps {
  title: string
  isSidebarOpen: boolean
  leadingPaddingClassName?: string
  leadingContent?: React.ReactNode
  leadingContentClassName?: string
}

export function WorkspaceHeader({
  title,
  leadingPaddingClassName,
  leadingContent,
  leadingContentClassName,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={[
        'flex h-16 shrink-0 items-center px-4 transition-[padding] duration-200 ease-out md:px-5',
        leadingPaddingClassName ?? '',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center">
        {leadingContent ? (
          <div className={['flex shrink-0 items-center', leadingContentClassName ?? 'mr-4'].join(' ')}>
            {leadingContent}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
      </div>
    </header>
  )
}
