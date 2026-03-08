interface AssistantMessageProps {
  content: string
}

export function AssistantMessage({ content }: AssistantMessageProps) {
  return <p className="max-w-[82%] text-left text-[15px] leading-6 text-foreground">{content}</p>
}
