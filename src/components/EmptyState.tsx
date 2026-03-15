
interface EmptyStateProps {
  folderName: string
}

export function EmptyState({ folderName }: EmptyStateProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo/icon.svg`

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="mb-6 flex items-center justify-center">
        <img
          src={logoSrc}
          alt="Echosphere Logo"
          className="h-20 w-20 md:h-24 md:w-24 opacity-90"
        />
      </div>
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Start a conversation in {folderName}
        </h2>
        <p className="text-base text-muted-foreground md:text-lg">Send a message to begin chatting</p>
      </div>
    </div>
  )
}
