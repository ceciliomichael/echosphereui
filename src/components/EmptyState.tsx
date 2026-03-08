
interface EmptyStateProps {
  folderName: string
}

export function EmptyState({ folderName }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="mb-6 flex items-center justify-center">
        <img 
          src="/logo/icon.svg" 
          alt="Echosphere Logo" 
          className="h-20 w-20 md:h-24 md:w-24 opacity-90"
        />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-[#101011] md:text-3xl">
          Start a conversation in {folderName}
        </h2>
        <p className="text-[#606266] text-base md:text-lg">
          Send a message to begin chatting
        </p>
      </div>
    </div>
  )
}
