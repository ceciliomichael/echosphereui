import { chatSurfaceClassName } from '../lib/chatStyles'

interface UserMessageProps {
  content: string
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className={`${chatSurfaceClassName} max-w-[82%] px-4 py-3 text-[15px] leading-6 text-[#111111]`}>
      {content}
    </div>
  )
}
