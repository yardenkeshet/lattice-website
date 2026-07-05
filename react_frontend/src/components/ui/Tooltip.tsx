import * as React from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  content: string
  children: React.ReactElement
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)
  const [coords, setCoords] = React.useState({ top: 0, left: 0, flipBelow: false })
  const ref = React.useRef<Element>(null)

  const show = () => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const flipBelow = rect.top < 80
    const MARGIN = 8
    const MAX_HALF = 160  // maxWidth / 2 = 320 / 2
    const centerLeft = rect.left + rect.width / 2
    const clampedLeft = Math.max(
      MARGIN + MAX_HALF,
      Math.min(centerLeft, window.innerWidth - MARGIN - MAX_HALF),
    )
    setCoords({
      top: flipBelow ? rect.bottom + 8 : rect.top - 8,
      left: clampedLeft,
      flipBelow,
    })
    setVisible(true)
  }

  const hide = () => setVisible(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trigger = React.cloneElement(children as React.ReactElement<any>, {
    ref,
    onMouseEnter: (e: React.MouseEvent) => {
      (children as React.ReactElement<any>).props.onMouseEnter?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (children as React.ReactElement<any>).props.onMouseLeave?.(e)
      hide()
    },
  })

  return (
    <>
      {trigger}
      {visible && typeof document !== 'undefined' && createPortal(
        <div style={tooltipStyle(coords)}>{content}</div>,
        document.body,
      )}
    </>
  )
}

function tooltipStyle(coords: { top: number; left: number; flipBelow: boolean }): React.CSSProperties {
  return {
    position: 'fixed',
    top: coords.top,
    left: coords.left,
    transform: coords.flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    backgroundColor: 'rgba(4, 44, 78, 0.93)',
    color: '#ffffff',
    fontFamily: 'var(--font-body)',
    fontSize: 11,
    lineHeight: 1.55,
    padding: '7px 11px',
    borderRadius: 8,
    boxShadow: '0 2px 10px rgba(0,0,0,0.28)',
    width: 'fit-content',
    maxWidth: 320,
    whiteSpace: 'pre-line',
    zIndex: 9999,
    pointerEvents: 'none',
  }
}
