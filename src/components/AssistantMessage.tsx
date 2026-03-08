import { chatMessageContentWidthClassName } from '../lib/chatStyles'

interface AssistantMessageProps {
  content: string
}

export function AssistantMessage({ content }: AssistantMessageProps) {
  return <p className={`${chatMessageContentWidthClassName} text-left text-[15px] leading-6 text-foreground`}>{content}</p>
}
