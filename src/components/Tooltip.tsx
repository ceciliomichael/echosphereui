import {
  cloneElement,
  isValidElement,
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
  children: ReactElement<TooltipChildProps>
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

const TOOLTIP_OFFSET = 6
const TOOLTIP_EDGE_PADDING = 12

function mergeClassNames(left: string | undefined, right: string) {
  return left ? `${left} ${right}` : right
}

export function Tooltip({ children, content, side = 'top' }: TooltipProps) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
    left: 0,
    top: 0,
    opacity: 0,
    visibility: 'hidden',
  })

  useLayoutEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) {
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
  }, [isVisible, side])

  if (!isValidElement<TooltipChildProps>(children)) {
    return children
  }

  const enhancedChild = cloneElement(children, {
    'aria-describedby': isVisible ? tooltipId : undefined,
    className: mergeClassNames(
      typeof children.props.className === 'string' ? children.props.className : undefined,
      'outline-none',
    ),
  })

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
      >
        {enhancedChild}
      </span>
      {isVisible
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-50 max-w-[min(18rem,calc(100vw-24px))] rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-white shadow-soft transition-opacity duration-150 ease-out"
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
