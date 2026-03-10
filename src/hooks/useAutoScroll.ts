import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { Message } from '../types/chat'

interface UseAutoScrollOptions {
  resetKey?: string | null
  shouldAutoScroll?: boolean
}

function getUserMessageCount(messages: Message[]): number {
  return messages.filter((message) => message.role === 'user').length
}

function isAtBottom(element: HTMLDivElement, threshold = 24): boolean {
  return Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) <= threshold
}

function hasSelectionInside(container: HTMLDivElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false
  }

  const range = selection.getRangeAt(0)
  const commonNode = range.commonAncestorContainer
  const targetNode = commonNode.nodeType === Node.TEXT_NODE ? commonNode.parentNode : commonNode
  return targetNode instanceof Node ? container.contains(targetNode) : false
}

export function useAutoScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  messages: Message[],
  options?: UseAutoScrollOptions,
): void {
  const shouldAutoScroll = options?.shouldAutoScroll ?? true
  const resetKey = options?.resetKey ?? null
  const userHasScrolledUpRef = useRef(false)
  const isProgrammaticScrollRef = useRef(false)
  const releaseProgrammaticFlagTimeoutRef = useRef<number | null>(null)
  const userMessageCount = useMemo(() => getUserMessageCount(messages), [messages])

  const releaseProgrammaticFlag = useCallback(() => {
    if (releaseProgrammaticFlagTimeoutRef.current !== null) {
      window.clearTimeout(releaseProgrammaticFlagTimeoutRef.current)
    }

    releaseProgrammaticFlagTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
      releaseProgrammaticFlagTimeoutRef.current = null
    }, 32)
  }, [])

  useEffect(() => {
    userHasScrolledUpRef.current = false
  }, [userMessageCount])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    userHasScrolledUpRef.current = false
    isProgrammaticScrollRef.current = true
    element.scrollTop = element.scrollHeight
    releaseProgrammaticFlag()
  }, [containerRef, releaseProgrammaticFlag, resetKey])

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const onScroll = () => {
      if (isProgrammaticScrollRef.current || !shouldAutoScroll) {
        return
      }

      userHasScrolledUpRef.current = !isAtBottom(element)
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!shouldAutoScroll || userHasScrolledUpRef.current || hasSelectionInside(element)) {
        return
      }

      isProgrammaticScrollRef.current = true
      element.scrollTop = element.scrollHeight
      releaseProgrammaticFlag()
    })

    element.addEventListener('scroll', onScroll, { passive: true })
    resizeObserver.observe(element)
    Array.from(element.children).forEach((child) => resizeObserver.observe(child))

    return () => {
      if (releaseProgrammaticFlagTimeoutRef.current !== null) {
        window.clearTimeout(releaseProgrammaticFlagTimeoutRef.current)
        releaseProgrammaticFlagTimeoutRef.current = null
      }

      resizeObserver.disconnect()
      element.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, releaseProgrammaticFlag, shouldAutoScroll, messages.length])
}
