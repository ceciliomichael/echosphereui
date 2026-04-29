import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { Message } from '../types/chat'

interface UseAutoScrollOptions {
  resetKey?: string | null
  shouldAutoScroll?: boolean
}

function getUserMessageCount(messages: Message[]): number {
  return messages.filter((message) => message.role === 'user').length
}

function isAtBottom(element: HTMLDivElement, threshold = 25): boolean {
  return Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < threshold
}

export function useAutoScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  messages: Message[],
  options?: UseAutoScrollOptions,
): void {
  const shouldAutoScroll = options?.shouldAutoScroll ?? true
  const resetKey = options?.resetKey ?? null
  const shouldStickToBottomRef = useRef(true)
  const userMessageCount = useMemo(() => getUserMessageCount(messages), [messages])

  const scrollToBottom = () => {
    const element = containerRef.current
    if (!element) {
      return
    }

    element.scrollTop = element.scrollHeight
  }

  useEffect(() => {
    shouldStickToBottomRef.current = true
  }, [userMessageCount])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    shouldStickToBottomRef.current = true
    scrollToBottom()
  }, [containerRef, resetKey])

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const handleScroll = () => {
      if (!shouldAutoScroll) {
        return
      }

      shouldStickToBottomRef.current = isAtBottom(element)
    }

    element.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      element.removeEventListener('scroll', handleScroll)
    }
  }, [containerRef, shouldAutoScroll])

  useLayoutEffect(() => {
    if (!shouldAutoScroll || !shouldStickToBottomRef.current) {
      return
    }

    scrollToBottom()
  }, [messages, shouldAutoScroll])

}
