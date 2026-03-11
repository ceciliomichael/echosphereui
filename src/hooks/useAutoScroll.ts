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
  const pendingScrollRafRef = useRef<number | null>(null)
  const lastKnownScrollHeightRef = useRef(0)
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

  const scrollToBottomIfAllowed = useCallback(
    (element: HTMLDivElement, force = false) => {
      if (!shouldAutoScroll || hasSelectionInside(element)) {
        return
      }

      const previousScrollHeight = lastKnownScrollHeightRef.current
      const wasNearBottomBeforeChange =
        previousScrollHeight === 0
          ? isAtBottom(element, 48)
          : Math.abs(previousScrollHeight - element.scrollTop - element.clientHeight) <= 48
      const isNearBottomNow = isAtBottom(element, 48)

      if (!force && userHasScrolledUpRef.current && !wasNearBottomBeforeChange && !isNearBottomNow) {
        lastKnownScrollHeightRef.current = element.scrollHeight
        return
      }

      isProgrammaticScrollRef.current = true
      element.scrollTop = element.scrollHeight
      lastKnownScrollHeightRef.current = element.scrollHeight
      releaseProgrammaticFlag()
    },
    [releaseProgrammaticFlag, shouldAutoScroll],
  )

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
    lastKnownScrollHeightRef.current = element.scrollHeight
    releaseProgrammaticFlag()
  }, [containerRef, releaseProgrammaticFlag, resetKey])

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    lastKnownScrollHeightRef.current = element.scrollHeight

    const onScroll = () => {
      if (isProgrammaticScrollRef.current || !shouldAutoScroll) {
        return
      }

      userHasScrolledUpRef.current = !isAtBottom(element, 48)
      lastKnownScrollHeightRef.current = element.scrollHeight
    }

    const scheduleAutoScroll = () => {
      if (pendingScrollRafRef.current !== null) {
        return
      }

      pendingScrollRafRef.current = window.requestAnimationFrame(() => {
        pendingScrollRafRef.current = null
        scrollToBottomIfAllowed(element)
      })
    }

    const resizeObserver = new ResizeObserver(scheduleAutoScroll)
    const mutationObserver = new MutationObserver(() => {
      // Streaming text updates can change text nodes without a reliable resize event.
      scheduleAutoScroll()
    })

    element.addEventListener('scroll', onScroll, { passive: true })
    resizeObserver.observe(element)
    Array.from(element.children).forEach((child) => resizeObserver.observe(child))
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      if (releaseProgrammaticFlagTimeoutRef.current !== null) {
        window.clearTimeout(releaseProgrammaticFlagTimeoutRef.current)
        releaseProgrammaticFlagTimeoutRef.current = null
      }
      if (pendingScrollRafRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollRafRef.current)
        pendingScrollRafRef.current = null
      }

      resizeObserver.disconnect()
      mutationObserver.disconnect()
      element.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, scrollToBottomIfAllowed, shouldAutoScroll, messages.length])
}
