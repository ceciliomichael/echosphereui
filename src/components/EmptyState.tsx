import { MessageSquare, Sparkles } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-7 md:px-5">
      <div className="w-full max-w-xl rounded-xl border border-[#E7E7EA] bg-white px-7 py-8 text-center md:px-9 md:py-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-[#E7E7EA] bg-[#FAFAFB] md:h-[4.5rem] md:w-[4.5rem]">
          <MessageSquare className="h-8 w-8 text-[#171717] md:h-9 md:w-9" strokeWidth={1.8} />
        </div>
        <div className="mt-6 space-y-2.5 md:mt-7">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-[#111111] md:text-[1.7rem]">
            Start a focused conversation
          </p>
          <p className="mx-auto max-w-md text-[15px] leading-6 text-[#5F6368] md:text-base">
            Ask a question, draft an idea, or drop in notes. The chat stays clean, centered, and ready when you are.
          </p>
        </div>
        <div className="mt-7 inline-flex items-center gap-2 rounded-xl border border-[#ECECEE] bg-[#FAFAFB] px-3.5 py-2 text-sm font-medium text-[#3F434A] md:mt-8">
          <Sparkles className="h-4 w-4 text-[#171717]" strokeWidth={2} />
          Press Enter to send, Shift+Enter for a new line
        </div>
      </div>
    </div>
  )
}
