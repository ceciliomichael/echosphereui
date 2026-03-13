import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'

interface TooltipChildProps {
  className?: string
  'aria-describedby'?: string
}

interface TooltipProps {
  align?: 'center' | 'left'
  children: ReactElement<TooltipChildProps>
  content: string
  fullWidthTrigger?: boolean
  side?: 'top' | 'bottom' | 'left' | 'right'
  hideWhenTriggerExpanded?: boolean
  noWrap?: boolean
}

const TOOLTIP_OFFSET = 6
const TOOLTIP_EDGE_PADDING = 12

function mergeClassNames(left: string | undefined, right: string) {
  return left ? `${left} ${right}` : right
}

function triggerHasExpandedDescendant(triggerElement: HTMLSpanElement | null) {
  if (!triggerElement) {
    return false
  }

  return (
    triggerElement.getAttribute('aria-expanded') === 'true' ||
    triggerElement.getAttribute('data-open') === 'true' ||
    triggerElement.querySelector('[aria-expanded="true"], [data-open="true"]') !== null
  )
}

export function Tooltip({
  align = 'left',
  children,
  content,
  fullWidthTrigger = false,
  side = 'top',
  hideWhenTriggerExpanded = false,
  noWrap = false,
}: TooltipProps) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isTriggerExpanded, setIsTriggerExpanded] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
    left: 0,
    top: 0,
    opacity: 0,
    visibility: 'hidden',
  })

  useEffect(() => {
    if (!hideWhenTriggerExpanded) {
      setIsTriggerExpanded(false)
      return
    }

    const triggerElement = triggerRef.current
    if (!triggerElement) {
      return
    }

    function syncExpandedState() {
      setIsTriggerExpanded(triggerHasExpandedDescendant(triggerElement))
    }

    syncExpandedState()

    const observer = new MutationObserver(() => {
      syncExpandedState()
    })

    observer.observe(triggerElement, {
      attributes: true,
      attributeFilter: ['aria-expanded', 'data-open'],
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [children, hideWhenTriggerExpanded])

  useEffect(() => {
    if (hideWhenTriggerExpanded && isTriggerExpanded && isVisible) {
      setIsVisible(false)
    }
  }, [hideWhenTriggerExpanded, isTriggerExpanded, isVisible])

  const shouldSuppressTooltip = hideWhenTriggerExpanded && isTriggerExpanded

  useLayoutEffect(() => {
    if (!isVisible || shouldSuppressTooltip || !triggerRef.current || !tooltipRef.current) {
      return
    }

    function updateTooltipPosition() {
      const triggerRect = triggerRef.current?.getBoundingClientRect()
      const tooltipRect = tooltipRef.current?.getBoundingClientRect()
      if (!triggerRect || !tooltipRect) {
        return
      }

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const preferredSide = side
      const fitsTop = triggerRect.top >= tooltipRect.height + TOOLTIP_OFFSET + TOOLTIP_EDGE_PADDING
      const fitsBottom =
        viewportHeight - triggerRect.bottom >= tooltipRect.height + TOOLTIP_OFFSET + TOOLTIP_EDGE_PADDING
      const fitsLeft = triggerRect.left >= tooltipRect.width + TOOLTIP_OFFSET + TOOLTIP_EDGE_PADDING
      const fitsRight =
        viewportWidth - triggerRect.right >= tooltipRect.width + TOOLTIP_OFFSET + TOOLTIP_EDGE_PADDING

      const nextSide =
        preferredSide === 'top'
          ? fitsTop || !fitsBottom
            ? 'top'
            : 'bottom'
          : preferredSide === 'bottom'
            ? fitsBottom || !fitsTop
              ? 'bottom'
              : 'top'
            : preferredSide === 'left'
              ? fitsLeft || !fitsRight
                ? 'left'
                : 'right'
              : fitsRight || !fitsLeft
                ? 'right'
                : 'left'

      const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      const centeredTop = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
      const clampedLeft = Math.min(
        Math.max(centeredLeft, TOOLTIP_EDGE_PADDING),
        viewportWidth - tooltipRect.width - TOOLTIP_EDGE_PADDING,
      )
      const clampedTop = Math.min(
        Math.max(centeredTop, TOOLTIP_EDGE_PADDING),
        viewportHeight - tooltipRect.height - TOOLTIP_EDGE_PADDING,
      )

      const left =
        nextSide === 'left'
          ? triggerRect.left - tooltipRect.width - TOOLTIP_OFFSET
          : nextSide === 'right'
            ? triggerRect.right + TOOLTIP_OFFSET
            : clampedLeft
      const top =
        nextSide === 'top'
          ? triggerRect.top - tooltipRect.height - TOOLTIP_OFFSET
          : nextSide === 'bottom'
            ? triggerRect.bottom + TOOLTIP_OFFSET
            : clampedTop

      setTooltipStyle({
        left: Math.min(
          Math.max(left, TOOLTIP_EDGE_PADDING),
          viewportWidth - tooltipRect.width - TOOLTIP_EDGE_PADDING,
        ),
        top: Math.min(
          Math.max(top, TOOLTIP_EDGE_PADDING),
          viewportHeight - tooltipRect.height - TOOLTIP_EDGE_PADDING,
        ),
        opacity: 1,
        visibility: 'visible',
      })
    }

    updateTooltipPosition()
    window.addEventListener('scroll', updateTooltipPosition, true)
    window.addEventListener('resize', updateTooltipPosition)

    return () => {
      window.removeEventListener('scroll', updateTooltipPosition, true)
      window.removeEventListener('resize', updateTooltipPosition)
    }
  }, [isVisible, shouldSuppressTooltip, side])

  if (!isValidElement<TooltipChildProps>(children)) {
    return children
  }

  const enhancedChild = cloneElement(children, {
    'aria-describedby': isVisible && !shouldSuppressTooltip ? tooltipId : undefined,
    className: mergeClassNames(
      typeof children.props.className === 'string' ? children.props.className : undefined,
      'outline-none',
    ),
  })

  return (
    <>
      <span
        ref={triggerRef}
        className={fullWidthTrigger ? 'flex w-full' : 'inline-flex'}
        onMouseEnter={() => {
          if (shouldSuppressTooltip) {
            setIsVisible(false)
            return
          }

          setIsVisible(true)
        }}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => {
          if (shouldSuppressTooltip) {
            setIsVisible(false)
            return
          }

          setIsVisible(true)
        }}
        onBlur={() => setIsVisible(false)}
      >
        {enhancedChild}
      </span>
      {isVisible && !shouldSuppressTooltip
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className={[
                'pointer-events-none fixed z-50 rounded-xl border border-tooltip-border bg-tooltip-surface px-3 py-2 text-xs font-medium text-tooltip-foreground shadow-soft transition-opacity duration-150 ease-out',
                noWrap ? 'w-max' : 'max-w-[min(18rem,calc(100vw-24px))]',
                align === 'center' ? 'text-center' : 'text-left',
                noWrap ? 'whitespace-nowrap' : '',
              ].join(' ')}
              style={tooltipStyle}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
