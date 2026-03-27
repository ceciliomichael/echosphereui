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
  const userHasScrolledRef = useRef(false)
  const isAutoScrolling = useRef(false)
  const userMessageCount = useMemo(() => getUserMessageCount(messages), [messages])

  useEffect(() => {
    userHasScrolledRef.current = false
  }, [userMessageCount])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    userHasScrolledRef.current = false
    isAutoScrolling.current = true
    element.scrollTop = element.scrollHeight

    const timeoutId = window.setTimeout(() => {
      isAutoScrolling.current = false
    }, 50)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [containerRef, resetKey])

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const handleScroll = () => {
      if (isAutoScrolling.current || !shouldAutoScroll) {
        return
      }

      userHasScrolledRef.current = !isAtBottom(element)
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!element || userHasScrolledRef.current || !shouldAutoScroll) {
        return
      }

      isAutoScrolling.current = true
      element.scrollTop = element.scrollHeight

      window.setTimeout(() => {
        isAutoScrolling.current = false
      }, 50)
    })

    element.addEventListener('scroll', handleScroll, { passive: true })
    resizeObserver.observe(element)
    Array.from(element.children).forEach((child) => {
      resizeObserver.observe(child)
    })

    return () => {
      resizeObserver.disconnect()
      element.removeEventListener('scroll', handleScroll)
    }
  }, [containerRef, shouldAutoScroll, messages.length])
}
